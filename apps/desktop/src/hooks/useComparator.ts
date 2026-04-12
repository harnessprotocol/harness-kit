import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ComparisonSummary,
  ComparisonPhase,
} from "@harness-kit/shared";
import { buildInvokeCommand } from "../lib/harness-definitions";
import { getResilienceConfig } from "../lib/preferences";
import {
  saveComparison,
  savePanel,
  listComparisons,
  getComparison,
  deleteComparison,
  updateComparisonTitle,
  updateComparisonStatus,
  updatePanelResult,
} from "../lib/tauri";

// ── Types ────────────────────────────────────────────────────

export interface PanelState {
  id: string;
  terminalId: string;
  harnessId: string;
  harnessName: string;
  model: string | null;
  status: "running" | "completed" | "failed";
  exitCode?: number;
  durationMs?: number;
  startedAt: number;
  /** Set when this panel's primary harness failed and a fallback was launched. */
  fallbackReason?: string;
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

interface TerminalOutputPayload {
  terminalId: string;
  data: string;
}

interface TerminalExitPayload {
  terminalId: string;
  exitCode: number;
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
  startComparison: (opts: {
    title: string;
    prompt: string;
    workingDir: string;
    pinnedCommit: string | null;
    harnesses: Array<{ id: string; name: string; model: string | null }>;
    taskType?: string;
  }) => Promise<void>;

  // Execution
  sendToPanel: (panelId: string, data: string) => Promise<void>;
  broadcastToAll: (prompt: string) => Promise<void>;
  endSession: () => Promise<void>;

  // Session management
  loadComparison: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  updateTitle: (title: string) => Promise<void>;

  // Terminal data
  getRawChunks: (terminalId: string) => string[];
  outputTick: number;
}

// ── Constants ────────────────────────────────────────────────

/** Max raw chunks per terminal before trimming (prevents unbounded memory growth). */
const MAX_RAW_CHUNKS = 5000;

// ── Hook ─────────────────────────────────────────────────────

export function useComparator(): UseComparatorReturn {
  const [sessions, setSessions] = useState<ComparisonSummary[]>([]);
  const [active, setActive] = useState<ComparisonState | null>(null);
  const [phase, setPhase] = useState<ComparisonPhase>("setup");
  const [outputTick, setOutputTick] = useState(0);

  // Raw chunks stored outside React state for performance — a Map of terminalId → string[].
  const rawChunksRef = useRef<Map<string, string[]>>(new Map());

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

  // ── Event listeners ─────────────────────────────────────────

  useEffect(() => {
    const unlistenOutput = listen<TerminalOutputPayload>("terminal://output", (event) => {
      const { terminalId, data } = event.payload;
      const chunks = rawChunksRef.current.get(terminalId);
      if (chunks) {
        chunks.push(data);
        // Trim old chunks to prevent unbounded memory growth.
        if (chunks.length > MAX_RAW_CHUNKS) {
          const excess = chunks.length - MAX_RAW_CHUNKS;
          chunks.splice(0, excess);
        }
        setOutputTick((t) => (t + 1) & 0x7fffffff);
      }
    });

    const unlistenExit = listen<TerminalExitPayload>("terminal://exit", (event) => {
      const { terminalId, exitCode } = event.payload;
      const now = Date.now();

      setActive((prev) => {
        if (!prev) return prev;

        const exitedPanel = prev.panels.find((p) => p.terminalId === terminalId);
        if (!exitedPanel) return prev;

        // Record health result (best-effort — don't block state update).
        invoke("record_harness_launch_result", {
          harnessId: exitedPanel.harnessId,
          exitCode,
        }).catch(() => {});

        // Check resilience config for fallback on failure.
        let fallbackPanel: PanelState | null = null;
        if (exitCode !== 0) {
          const resilienceConfig = getResilienceConfig();
          const cfg = resilienceConfig[exitedPanel.harnessId];
          if (cfg?.fallbackHarnessId) {
            const fallbackId = cfg.fallbackHarnessId;
            // Only fall back if no panel for this harness is already running.
            const alreadyRunning = prev.panels.some(
              (p) => p.harnessId === fallbackId && p.status === "running",
            );
            if (!alreadyRunning) {
              const panelId = crypto.randomUUID();
              const newTerminalId = `fallback-${panelId}`;
              fallbackPanel = {
                id: panelId,
                terminalId: newTerminalId,
                harnessId: fallbackId,
                harnessName: fallbackId,
                model: exitedPanel.model,
                status: "running" as const,
                startedAt: now,
              };

              // Launch PTY for fallback harness.
              (async () => {
                try {
                  const tid = await invoke<string>("create_terminal", {
                    projectPath: prev.workingDir,
                  });
                  rawChunksRef.current.set(tid, []);
                  const command = buildInvokeCommand(
                    fallbackId,
                    prev.prompt,
                    exitedPanel.model ?? undefined,
                  );
                  if (command) {
                    await invoke("write_terminal", { terminalId: tid, data: command + "\n" });
                  }
                  // Update the fallback panel with the real terminalId.
                  setActive((s) => {
                    if (!s) return s;
                    return {
                      ...s,
                      panels: s.panels.map((p) =>
                        p.id === panelId ? { ...p, terminalId: tid } : p,
                      ),
                    };
                  });
                } catch (e) {
                  console.error("Failed to launch fallback harness:", e);
                }
              })();
            }
          }
        }

        const durationMs = now - exitedPanel.startedAt;
        const status = exitCode === 0 ? ("completed" as const) : ("failed" as const);
        const fallbackReason = fallbackPanel
          ? `Primary failed (exit ${exitCode}), switching to ${fallbackPanel.harnessName}`
          : undefined;

        // Persist panel result to backend.
        updatePanelResult(prev.id, exitedPanel.id, exitCode, durationMs, status).catch(console.error);

        const updatedPanels = prev.panels.map((p) =>
          p.terminalId === terminalId
            ? { ...p, status, exitCode, durationMs, fallbackReason }
            : p,
        );

        const allPanels = fallbackPanel
          ? [...updatedPanels, fallbackPanel]
          : updatedPanels;

        // Check if all panels have finished.
        const allDone = allPanels.every((p) => p.status !== "running");

        if (allDone) {
          // Transition to results phase and mark comparison as completed.
          updateComparisonStatus(prev.id, "completed").catch(console.error);
          setPhase("results");
          // Refresh session list so the sidebar reflects the new status.
          loadSessions().catch(console.error);
        }

        return { ...prev, panels: allPanels };
      });
    });

    return () => {
      unlistenOutput.then((f) => f());
      unlistenExit.then((f) => f());
    };
  }, [loadSessions]);

  // ── Cleanup PTY sessions on unmount ─────────────────────────

  useEffect(() => {
    return () => {
      const current = activeRef.current;
      if (!current) return;
      for (const panel of current.panels) {
        invoke("destroy_terminal", { terminalId: panel.terminalId }).catch(() => {});
      }
    };
  }, []);

  // ── Start a new comparison ──────────────────────────────────

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

      // Create a panel + terminal for each harness.
      const panels: PanelState[] = [];

      for (const harness of opts.harnesses) {
        const panelId = crypto.randomUUID();

        // Persist panel to backend.
        await savePanel(panelId, comparisonId, harness.id, harness.name, harness.model);

        // Create PTY terminal for this panel.
        const terminalId = await invoke<string>("create_terminal", { projectPath: opts.workingDir });
        rawChunksRef.current.set(terminalId, []);

        const panel: PanelState = {
          id: panelId,
          terminalId,
          harnessId: harness.id,
          harnessName: harness.name,
          model: harness.model,
          status: "running",
          startedAt: Date.now(),
        };
        panels.push(panel);

        // Send the harness invoke command to the terminal.
        const command = buildInvokeCommand(harness.id, opts.prompt, harness.model ?? undefined);
        if (command) {
          await invoke("write_terminal", { terminalId, data: command + "\n" });
        } else {
          console.error(`Unknown harness: ${harness.id}`);
        }
      }

      const state: ComparisonState = {
        id: comparisonId,
        title: opts.title,
        prompt: opts.prompt,
        workingDir: opts.workingDir,
        pinnedCommit: opts.pinnedCommit,
        phase: "execution",
        panels,
        createdAt,
      };

      setActive(state);
      setPhase("execution");

      // Refresh session list to include the new comparison.
      loadSessions().catch(console.error);
    },
    [loadSessions],
  );

  // ── Send data to a specific panel ───────────────────────────

  const sendToPanel = useCallback(async (panelId: string, data: string) => {
    const current = activeRef.current;
    if (!current) return;

    const panel = current.panels.find((p) => p.id === panelId);
    if (!panel) {
      console.error(`Panel not found: ${panelId}`);
      return;
    }

    await invoke("write_terminal", { terminalId: panel.terminalId, data });
  }, []);

  // ── Broadcast a prompt to all running panels ────────────────

  const broadcastToAll = useCallback(
    async (prompt: string) => {
      const current = activeRef.current;
      if (!current) return;

      const running = current.panels.filter((p) => p.status === "running");
      await Promise.all(
        running.map((panel) => {
          const command = buildInvokeCommand(panel.harnessId, prompt, panel.model ?? undefined);
          if (!command) return Promise.resolve();
          return invoke("write_terminal", {
            terminalId: panel.terminalId,
            data: command + "\n",
          });
        }),
      );
    },
    [],
  );

  // ── End the active session ──────────────────────────────────

  const endSession = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return;

    // Destroy all terminals.
    for (const panel of current.panels) {
      invoke("destroy_terminal", { terminalId: panel.terminalId }).catch(() => {});
    }

    // Mark any still-running panels as completed in local state.
    const now = Date.now();
    const finalPanels = current.panels.map((p) => {
      if (p.status !== "running") return p;
      const durationMs = now - p.startedAt;
      updatePanelResult(current.id, p.id, -1, durationMs, "completed").catch(console.error);
      return { ...p, status: "completed" as const, exitCode: -1, durationMs };
    });

    await updateComparisonStatus(current.id, "completed").catch(console.error);

    setActive((prev) => (prev ? { ...prev, panels: finalPanels } : prev));
    setPhase("results");
    loadSessions().catch(console.error);
  }, [loadSessions]);

  // ── Load a past comparison ──────────────────────────────────

  const loadComparison = useCallback(async (id: string) => {
    try {
      // Destroy terminals from any currently-active live comparison.
      const current = activeRef.current;
      if (current) {
        for (const panel of current.panels) {
          if (panel.terminalId) {
            invoke("destroy_terminal", { terminalId: panel.terminalId }).catch(() => {});
          }
        }
      }

      const detail = await getComparison(id);
      if (!detail) {
        console.error("Comparison not found:", id);
        await loadSessions(); // Refresh sidebar (entry may be stale)
        return;
      }

      const panels: PanelState[] = detail.panels.map((p) => ({
        id: p.id,
        terminalId: "", // No live terminal for past sessions.
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
        // Destroy live terminals if deleting the active comparison.
        const current = activeRef.current;
        if (current?.id === id) {
          for (const panel of current.panels) {
            if (panel.terminalId) {
              invoke("destroy_terminal", { terminalId: panel.terminalId }).catch(() => {});
            }
          }
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

  // ── Terminal data access ────────────────────────────────────

  const getRawChunks = useCallback((terminalId: string): string[] => {
    return rawChunksRef.current.get(terminalId) ?? [];
  }, []);

  // ── Return ──────────────────────────────────────────────────

  return {
    sessions,
    loadSessions,
    active,
    phase,
    setPhase,
    startComparison,
    sendToPanel,
    broadcastToAll,
    endSession,
    loadComparison,
    deleteSession,
    updateTitle,
    getRawChunks,
    outputTick,
  };
}
