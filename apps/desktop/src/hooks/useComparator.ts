import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ComparisonSummary,
  ComparisonPhase,
} from "@harness-kit/shared";
import { getHarness } from "../lib/harness-definitions";
import {
  saveComparison,
  savePanel,
  listComparisons,
  getComparison,
  deleteComparison,
  updateComparisonTitle,
  updateComparisonStatus,
} from "../lib/tauri";

// ── Types ────────────────────────────────────────────────────

export interface PanelState {
  id: string;
  harnessId: string;
  harnessName: string;
  model: string | null;
  status: "running" | "completed" | "failed";
  exitCode?: number;
  durationMs?: number;
  startedAt: number;
  /** Set when this panel's primary harness failed and a fallback was launched. */
  fallbackReason?: string;
  acpMode?: boolean;              // True when running with ACP protocol
}

export interface ComparisonState {
  id: string;
  title: string;
  prompt: string;
  workingDir: string;
  pinnedCommit: string | null;
  phase: ComparisonPhase;
  panels: PanelState[];
  createdAt: string;
}

export interface UseComparatorReturn {
  // Session list
  sessions: ComparisonSummary[];
  loadSessions: () => Promise<void>;

  // Active comparison
  active: ComparisonState | null;
  phase: ComparisonPhase;
  setPhase: (phase: ComparisonPhase) => void;

  // Setup
  // NOTE: Live in-app execution (spawning a harness process and streaming its
  // output) is not available in this build. This records the comparison and
  // its panels so they can be reviewed/annotated, but does not run anything.
  startComparison: (opts: {
    title: string;
    prompt: string;
    workingDir: string;
    pinnedCommit: string | null;
    harnesses: Array<{ id: string; name: string; model: string | null }>;
    taskType?: string;
  }) => Promise<void>;

  endSession: () => Promise<void>;

  // Session management
  loadComparison: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  updateTitle: (title: string) => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────

export function useComparator(): UseComparatorReturn {
  const [sessions, setSessions] = useState<ComparisonSummary[]>([]);
  const [active, setActive] = useState<ComparisonState | null>(null);
  const [phase, setPhase] = useState<ComparisonPhase>("setup");

  // Refs for accessing latest state in callbacks without stale closures.
  const activeRef = useRef<ComparisonState | null>(null);
  activeRef.current = active;

  const sessionsRef = useRef<ComparisonSummary[]>([]);
  sessionsRef.current = sessions;

  // ── Session list ────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    try {
      const list = await listComparisons();
      setSessions(list);
    } catch (err) {
      console.error("Failed to load comparisons:", err);
    }
  }, []);

  // Load sessions on mount.
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ── Start a new comparison ──────────────────────────────────
  //
  // Live in-app execution isn't available in this build (the terminal/PTY
  // backend was removed). This persists the comparison and its panels so
  // they exist as a record, but panels are never actually run — results
  // must be recorded manually.

  const startComparison = useCallback(
    async (opts: {
      title: string;
      prompt: string;
      workingDir: string;
      pinnedCommit: string | null;
      harnesses: Array<{ id: string; name: string; model: string | null }>;
      taskType?: string;
    }) => {
      const comparisonId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      // Persist comparison to backend.
      await saveComparison(comparisonId, opts.title, opts.prompt, opts.workingDir, opts.pinnedCommit);

      // Tag task type if provided (best-effort — don't block if it fails).
      if (opts.taskType) {
        invoke("tag_comparison_task_type", {
          comparisonId,
          taskType: opts.taskType,
        }).catch((e) => console.warn("tag_comparison_task_type failed:", e));
      }

      // Create a panel record for each harness (no live process is started).
      const panels: PanelState[] = [];

      for (const harness of opts.harnesses) {
        const panelId = crypto.randomUUID();

        // Persist panel to backend.
        await savePanel(panelId, comparisonId, harness.id, harness.name, harness.model);

        panels.push({
          id: panelId,
          harnessId: harness.id,
          harnessName: harness.name,
          model: harness.model,
          status: "completed",
          startedAt: Date.now(),
          acpMode: getHarness(harness.id)?.protocol === "acp",
        });
      }

      const state: ComparisonState = {
        id: comparisonId,
        title: opts.title,
        prompt: opts.prompt,
        workingDir: opts.workingDir,
        pinnedCommit: opts.pinnedCommit,
        phase: "results",
        panels,
        createdAt,
      };

      await updateComparisonStatus(comparisonId, "completed").catch(console.error);

      setActive(state);
      setPhase("results");

      // Refresh session list to include the new comparison.
      loadSessions().catch(console.error);
    },
    [loadSessions],
  );

  // ── End the active session ──────────────────────────────────

  const endSession = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return;

    // Mark any still-running panels as completed in local state.
    const finalPanels = current.panels.map((p) =>
      p.status !== "running" ? p : { ...p, status: "completed" as const },
    );

    await updateComparisonStatus(current.id, "completed").catch(console.error);

    setActive((prev) => (prev ? { ...prev, panels: finalPanels } : prev));
    setPhase("results");
    loadSessions().catch(console.error);
  }, [loadSessions]);

  // ── Load a past comparison ──────────────────────────────────

  const loadComparison = useCallback(async (id: string) => {
    try {
      const detail = await getComparison(id);
      if (!detail) {
        console.error("Comparison not found:", id);
        await loadSessions(); // Refresh sidebar (entry may be stale)
        return;
      }

      const panels: PanelState[] = detail.panels.map((p) => ({
        id: p.id,
        harnessId: p.harnessId,
        harnessName: p.harnessName,
        model: p.model,
        status: p.status === "cancelled" ? ("failed" as const) : (p.status as PanelState["status"]),
        exitCode: p.exitCode ?? undefined,
        durationMs: p.durationMs ?? undefined,
        startedAt: 0,
      }));

      const state: ComparisonState = {
        id: detail.id,
        title: detail.title ?? "",
        prompt: detail.prompt,
        workingDir: detail.workingDir,
        pinnedCommit: detail.pinnedCommit,
        phase: "results",
        panels,
        createdAt: detail.createdAt,
      };

      setActive(state);
      setPhase("results");
    } catch (err) {
      console.error("Failed to load comparison:", err);
    }
  }, [loadSessions]);

  // ── Delete a session ────────────────────────────────────────

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        if (activeRef.current?.id === id) {
          setActive(null);
          setPhase("setup");
        }

        await deleteComparison(id);
        await loadSessions();
      } catch (err) {
        console.error("Failed to delete comparison:", err);
      }
    },
    [loadSessions],
  );

  // ── Update active session title ─────────────────────────────

  const updateTitle = useCallback(
    async (title: string) => {
      const current = activeRef.current;
      if (!current) return;

      try {
        await updateComparisonTitle(current.id, title);
        setActive((prev) => (prev ? { ...prev, title } : prev));
        // Refresh session list to reflect the new title in the sidebar.
        loadSessions().catch(console.error);
      } catch (err) {
        console.error("Failed to update title:", err);
      }
    },
    [loadSessions],
  );

  // ── Return ──────────────────────────────────────────────────

  return {
    sessions,
    loadSessions,
    active,
    phase,
    setPhase,
    startComparison,
    endSession,
    loadComparison,
    deleteSession,
    updateTitle,
  };
}
