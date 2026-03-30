import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { buildInvokeCommand } from "../lib/harness-definitions";

// ── Types ────────────────────────────────────────────────────

export interface TerminalSession {
  id: string;
  title: string;
  status: "idle" | "running" | "exited";
  harnessId?: string;
  model?: string;
  exitCode?: number;
}

interface TerminalOutputPayload {
  terminalId: string;
  data: string;
}

interface TerminalExitPayload {
  terminalId: string;
  exitCode: number;
}

// ── Constants ────────────────────────────────────────────────

const MAX_TERMINALS = 12;

// ── Hook ─────────────────────────────────────────────────────

export interface UseTerminalsReturn {
  sessions: TerminalSession[];
  createTerminal: (projectPath: string) => Promise<string | null>;
  destroyTerminal: (id: string) => void;
  assignHarness: (id: string, harnessId: string, model?: string) => void;
  invokeInTerminal: (id: string, harnessId: string, prompt: string, model?: string) => Promise<void>;
  invokeAll: (prompt: string) => Promise<void>;
  getRawChunks: (id: string) => string[];
  /** Increments on every terminal output event — subscribe for re-renders. */
  outputTick: number;
  maxTerminals: number;
}

export function useTerminals(): UseTerminalsReturn {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [outputTick, setOutputTick] = useState(0);

  // Raw chunks stored outside React state for performance — a Map of id → string[].
  const rawChunksRef = useRef<Map<string, string[]>>(new Map());

  // Auto-incrementing title counter.
  const titleCounterRef = useRef(0);

  // ── Event listeners ──────────────────────────────────────────

  useEffect(() => {
    const unlistenOutput = listen<TerminalOutputPayload>("terminal://output", (event) => {
      const { terminalId, data } = event.payload;
      const chunks = rawChunksRef.current.get(terminalId);
      if (chunks) {
        chunks.push(data);
        setOutputTick((t) => t + 1);
      }
    });

    const unlistenExit = listen<TerminalExitPayload>("terminal://exit", (event) => {
      const { terminalId, exitCode } = event.payload;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === terminalId
            ? { ...s, status: "exited" as const, exitCode }
            : s,
        ),
      );
    });

    return () => {
      unlistenOutput.then((f) => f());
      unlistenExit.then((f) => f());
    };
  }, []);

  // ── Actions ──────────────────────────────────────────────────

  const createTerminal = useCallback(async (projectPath: string): Promise<string | null> => {
    if (sessions.length >= MAX_TERMINALS) return null;

    const terminalId = await invoke<string>("create_terminal", { projectPath });
    titleCounterRef.current += 1;
    const title = `Terminal ${titleCounterRef.current}`;

    rawChunksRef.current.set(terminalId, []);

    const session: TerminalSession = {
      id: terminalId,
      title,
      status: "idle",
    };

    setSessions((prev) => [...prev, session]);
    return terminalId;
  }, [sessions.length]);

  const destroyTerminal = useCallback((id: string) => {
    invoke("destroy_terminal", { terminalId: id }).catch(console.error);
    rawChunksRef.current.delete(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const assignHarness = useCallback((id: string, harnessId: string, model?: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, harnessId, model } : s,
      ),
    );
  }, []);

  const invokeInTerminal = useCallback(
    async (id: string, harnessId: string, prompt: string, model?: string) => {
      const command = buildInvokeCommand(harnessId, prompt, model);
      if (!command) {
        console.error(`Unknown harness: ${harnessId}`);
        return;
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: "running" as const, harnessId, model } : s,
        ),
      );

      // Write the command directly to the shell's stdin.
      await invoke("write_terminal", {
        terminalId: id,
        data: command + "\n",
      });
    },
    [],
  );

  const invokeAll = useCallback(
    async (prompt: string) => {
      const eligible = sessions.filter((s) => s.harnessId);
      await Promise.all(
        eligible.map((s) =>
          invokeInTerminal(s.id, s.harnessId!, prompt, s.model),
        ),
      );
    },
    [sessions, invokeInTerminal],
  );

  const getRawChunks = useCallback((id: string): string[] => {
    return rawChunksRef.current.get(id) ?? [];
  }, []);

  // ── Return ───────────────────────────────────────────────────

  return {
    sessions,
    createTerminal,
    destroyTerminal,
    assignHarness,
    invokeInTerminal,
    invokeAll,
    getRawChunks,
    outputTick,
    maxTerminals: MAX_TERMINALS,
  };
}
