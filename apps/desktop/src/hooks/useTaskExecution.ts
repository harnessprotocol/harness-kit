import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutionStatus, Project, Task } from "../lib/board-api";
import { api } from "../lib/board-api";
import { buildInvokeCommand, type PermissionConfig } from "../lib/harness-definitions";
import {
  getAllowedTools,
  getHarnessPermissionOverrides,
  getPermissionMode,
} from "../lib/preferences";

// ── Types ────────────────────────────────────────────────────

interface ActiveExecution {
  terminalId: string;
  rawChunks: string[];
  harnessId: string;
  model?: string;
  startedAt: number;
}

interface TerminalOutputPayload {
  terminalId: string;
  data: string;
}

interface TerminalExitPayload {
  terminalId: string;
  exitCode: number;
}

export interface UseTaskExecutionReturn {
  startTask: (
    projectSlug: string,
    task: Task,
    project: Project,
    harnessId?: string,
    model?: string,
  ) => Promise<void>;
  stopTask: (projectSlug: string, taskId: number) => Promise<void>;
  getOutput: (taskId: number) => string[];
  isRunning: (taskId: number) => boolean;
  getExecution: (taskId: number) => ActiveExecution | undefined;
  canStartMore: (project: Project) => boolean;
  outputTick: number;
}

// ── Constants ────────────────────────────────────────────────

const MAX_RAW_CHUNKS = 5000;
const DEFAULT_MAX_CONCURRENT = 3;

// ── Permission config resolver ───────────────────────────────

/**
 * Build the PermissionConfig for a given harness by merging the global mode
 * with any harness-level override the user has configured.
 */
function resolvePermissionConfig(harnessId: string): PermissionConfig {
  const overrides = getHarnessPermissionOverrides();
  const override = overrides[harnessId];
  const mode = override?.mode ?? getPermissionMode();
  const tools = override?.allowedTools ?? getAllowedTools();

  switch (mode) {
    case "auto":
      return { mode: "auto" };
    case "allowed-tools":
      return { mode: "allowed-tools", tools };
    default:
      return { mode: "skip" };
  }
}

// ── Prompt builder ───────────────────────────────────────────

function buildPrompt(task: Task): string {
  let prompt = `Work on board task #${task.id}: ${task.title}`;
  if (task.description) prompt += `\n\n${task.description}`;
  const pending = task.subtasks.filter((s) => s.status === "pending" || s.status === "in_progress");
  if (pending.length > 0) {
    prompt += `\n\nPending subtasks:\n${pending.map((s) => `- ${s.title}`).join("\n")}`;
  }
  return prompt;
}

// ── Hook ─────────────────────────────────────────────────────

export function useTaskExecution(): UseTaskExecutionReturn {
  // taskId → ActiveExecution
  const executionsRef = useRef<Map<number, ActiveExecution>>(new Map());
  // terminalId → taskId (for reverse lookup in event handlers)
  const terminalToTaskRef = useRef<Map<string, number>>(new Map());
  // projectSlug for each taskId (needed in exit handler)
  const taskProjectRef = useRef<Map<number, string>>(new Map());

  const [outputTick, setOutputTick] = useState(0);

  // ── Event listeners (registered once) ───────────────────────

  useEffect(() => {
    const unlistenOutput = listen<TerminalOutputPayload>("terminal://output", (event) => {
      const { terminalId, data } = event.payload;
      const taskId = terminalToTaskRef.current.get(terminalId);
      if (taskId === undefined) return;
      const exec = executionsRef.current.get(taskId);
      if (!exec) return;
      exec.rawChunks.push(data);
      if (exec.rawChunks.length > MAX_RAW_CHUNKS) {
        exec.rawChunks.splice(0, exec.rawChunks.length - MAX_RAW_CHUNKS);
      }
      setOutputTick((t) => (t + 1) & 0x7fffffff);
    });

    const unlistenExit = listen<TerminalExitPayload>("terminal://exit", async (event) => {
      const { terminalId, exitCode } = event.payload;
      const taskId = terminalToTaskRef.current.get(terminalId);
      if (taskId === undefined) return;

      const slug = taskProjectRef.current.get(taskId);
      executionsRef.current.delete(taskId);
      terminalToTaskRef.current.delete(terminalId);
      taskProjectRef.current.delete(taskId);
      setOutputTick((t) => (t + 1) & 0x7fffffff);

      if (slug) {
        const status: ExecutionStatus = exitCode === 0 ? "completed" : "failed";
        await api.tasks
          .updateExecution(slug, taskId, {
            status,
            finished_at: new Date().toISOString(),
            exit_code: exitCode,
          })
          .catch(console.error);
      }
    });

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
    };
  }, []);

  // ── startTask ────────────────────────────────────────────────

  const startTask = useCallback(
    async (
      projectSlug: string,
      task: Task,
      project: Project,
      harnessId?: string,
      model?: string,
    ) => {
      const maxConcurrent = project.max_concurrent ?? DEFAULT_MAX_CONCURRENT;
      if (executionsRef.current.size >= maxConcurrent) {
        throw new Error(`Concurrent task limit (${maxConcurrent}) reached`);
      }

      const resolvedHarness =
        harnessId ?? task.default_harness ?? project.default_harness ?? "claude";
      const resolvedModel = model ?? task.default_model ?? project.default_model ?? undefined;

      const workDir = task.worktree_path ?? undefined;
      const terminalId = await invoke<string>("create_terminal", { projectPath: workDir ?? "" });

      const prompt = buildPrompt(task);
      const permConfig = resolvePermissionConfig(resolvedHarness);
      const command = buildInvokeCommand(resolvedHarness, prompt, resolvedModel, permConfig);
      if (!command) throw new Error(`Unknown harness: ${resolvedHarness}`);

      executionsRef.current.set(task.id, {
        terminalId,
        rawChunks: [],
        harnessId: resolvedHarness,
        model: resolvedModel,
        startedAt: Date.now(),
      });
      terminalToTaskRef.current.set(terminalId, task.id);
      taskProjectRef.current.set(task.id, projectSlug);
      setOutputTick((t) => (t + 1) & 0x7fffffff);

      await invoke("write_terminal", { terminalId, data: command + "\n" });

      await Promise.all([
        api.tasks.updateExecution(projectSlug, task.id, {
          status: "running",
          harness_id: resolvedHarness,
          model: resolvedModel,
          started_at: new Date().toISOString(),
        }),
        api.tasks.update(projectSlug, task.id, { status: "in-progress" }),
      ]);
    },
    [],
  );

  // ── stopTask ─────────────────────────────────────────────────

  const stopTask = useCallback(async (projectSlug: string, taskId: number) => {
    const exec = executionsRef.current.get(taskId);
    if (!exec) return;

    await invoke("destroy_terminal", { terminalId: exec.terminalId }).catch(console.error);

    executionsRef.current.delete(taskId);
    terminalToTaskRef.current.delete(exec.terminalId);
    taskProjectRef.current.delete(taskId);
    setOutputTick((t) => (t + 1) & 0x7fffffff);

    await api.tasks
      .updateExecution(projectSlug, taskId, {
        status: "stopped",
        finished_at: new Date().toISOString(),
      })
      .catch(console.error);
  }, []);

  // ── Accessors ────────────────────────────────────────────────

  const getOutput = useCallback((taskId: number): string[] => {
    return executionsRef.current.get(taskId)?.rawChunks ?? [];
  }, []);

  const isRunning = useCallback((taskId: number): boolean => {
    return executionsRef.current.has(taskId);
  }, []);

  const getExecution = useCallback((taskId: number): ActiveExecution | undefined => {
    return executionsRef.current.get(taskId);
  }, []);

  const canStartMore = useCallback((project: Project): boolean => {
    const max = project.max_concurrent ?? DEFAULT_MAX_CONCURRENT;
    return executionsRef.current.size < max;
  }, []);

  return { startTask, stopTask, getOutput, isRunning, getExecution, canStartMore, outputTick };
}
