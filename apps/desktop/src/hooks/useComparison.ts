import { useReducer, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { PanelOutput, PanelComplete, FileDiff } from "@harness-kit/shared";

// ── Types ───────────────────────────────────────────────────

export type Phase = "setup" | "running" | "complete";

export interface PanelState {
  panelId: string;
  harnessId: string;
  harnessName: string;
  model?: string;
  outputLines: string[];
  status: "pending" | "running" | "complete" | "killed";
  exitCode: number | null;
  durationMs: number;
  startedAt: number | null;
}

export interface ComparisonState {
  comparisonId: string;
  prompt: string;
  workingDir: string;
  panels: PanelState[];
  phase: Phase;
  diffs: Record<string, FileDiff[]> | null;
}

// ── Actions ─────────────────────────────────────────────────

type Action =
  | { type: "START"; comparisonId: string; prompt: string; workingDir: string; panels: PanelState[] }
  | { type: "OUTPUT"; panelId: string; data: string }
  | { type: "COMPLETE"; panelId: string; exitCode: number | null; durationMs: number }
  | { type: "KILL"; panelId: string }
  | { type: "DIFFS_LOADED"; panelId: string; diffs: FileDiff[] }
  | { type: "RESET" };

const initialState: ComparisonState = {
  comparisonId: "",
  prompt: "",
  workingDir: "",
  panels: [],
  phase: "setup",
  diffs: null,
};

export function reducer(state: ComparisonState, action: Action): ComparisonState {
  switch (action.type) {
    case "START":
      return {
        comparisonId: action.comparisonId,
        prompt: action.prompt,
        workingDir: action.workingDir,
        panels: action.panels.map((p) => ({ ...p, status: "running", startedAt: Date.now() })),
        phase: "running",
        diffs: null,
      };

    case "OUTPUT":
      return {
        ...state,
        panels: state.panels.map((p) =>
          p.panelId === action.panelId
            ? { ...p, outputLines: [...p.outputLines, action.data] }
            : p,
        ),
      };

    case "COMPLETE": {
      const updated = state.panels.map((p) =>
        p.panelId === action.panelId
          ? { ...p, status: "complete" as const, exitCode: action.exitCode, durationMs: action.durationMs }
          : p,
      );
      const allDone = updated.every((p) => p.status === "complete" || p.status === "killed");
      return { ...state, panels: updated, phase: allDone ? "complete" : state.phase };
    }

    case "KILL": {
      const updated = state.panels.map((p) =>
        p.panelId === action.panelId ? { ...p, status: "killed" as const } : p,
      );
      const allDone = updated.every((p) => p.status === "complete" || p.status === "killed");
      return { ...state, panels: updated, phase: allDone ? "complete" : state.phase };
    }

    case "DIFFS_LOADED":
      return {
        ...state,
        diffs: {
          ...state.diffs,
          [action.panelId]: action.diffs,
        },
      };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

// ── Hook ────────────────────────────────────────────────────

export function useComparison() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Subscribe to Tauri events when running.
  useEffect(() => {
    if (state.phase !== "running") return;

    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      const [unlisten1, unlisten2, unlisten3] = await Promise.all([
        listen<PanelOutput>("comparator://output", (event) => {
          if (!cancelled && event.payload.comparisonId === state.comparisonId) {
            dispatch({ type: "OUTPUT", panelId: event.payload.panelId, data: event.payload.data });
          }
        }),
        listen<PanelComplete>("comparator://complete", (event) => {
          if (!cancelled && event.payload.comparisonId === state.comparisonId) {
            dispatch({
              type: "COMPLETE",
              panelId: event.payload.panelId,
              exitCode: event.payload.exitCode,
              durationMs: event.payload.durationMs,
            });
          }
        }),
        listen<{ comparisonId: string; panelId: string; diffs: FileDiff[] }>(
          "comparator://diffs",
          (event) => {
            if (!cancelled && event.payload.comparisonId === state.comparisonId) {
              dispatch({
                type: "DIFFS_LOADED",
                panelId: event.payload.panelId,
                diffs: event.payload.diffs,
              });
            }
          },
        ),
      ]);
      unlisteners.push(unlisten1, unlisten2, unlisten3);
    };

    setup();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [state.phase, state.comparisonId]);

  const start = useCallback(
    (comparisonId: string, prompt: string, workingDir: string, panels: PanelState[]) => {
      dispatch({ type: "START", comparisonId, prompt, workingDir, panels });
    },
    [],
  );

  const markKilled = useCallback((panelId: string) => {
    dispatch({ type: "KILL", panelId });
  }, []);

  const loadDiffs = useCallback((panelId: string, diffs: FileDiff[]) => {
    dispatch({ type: "DIFFS_LOADED", panelId, diffs });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return { state, start, markKilled, loadDiffs, reset };
}
