// packages/agent-server/src/runner/thread-manager.ts
import type { RunnableConfig } from "@langchain/core/runnables";

/** Maps taskId → LangGraph thread config for checkpoint resume */
const threads = new Map<number, RunnableConfig>();

export function getThreadConfig(projectSlug: string, taskId: number): RunnableConfig {
  const existing = threads.get(taskId);
  if (existing) return existing;
  const config: RunnableConfig = {
    configurable: { thread_id: `${projectSlug}:${taskId}` },
  };
  threads.set(taskId, config);
  return config;
}

export function clearThread(taskId: number) {
  threads.delete(taskId);
}

// Track running aborts so we can cancel
const abortControllers = new Map<number, AbortController>();
export function getAbort(taskId: number): AbortController {
  const ac = new AbortController();
  abortControllers.set(taskId, ac);
  return ac;
}
export function cancelTask(taskId: number) {
  abortControllers.get(taskId)?.abort();
  abortControllers.delete(taskId);
}
export function isRunning(taskId: number): boolean {
  return abortControllers.has(taskId);
}
