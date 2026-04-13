// packages/agent-server/src/runner/runner.ts

import { createCheckpointer } from "../checkpointer.js";
import { buildGraph } from "../graph/graph.js";
import type { Phase, SerializableTask, StartAgentOptions } from "../types.js";
import { clearSubscribers, emit } from "./broadcaster.js";
import { cancelTask, getAbort, getThreadConfig, isRunning } from "./thread-manager.js";

// Module-level graph singleton (checkpointer.setup() is called lazily on first DB access)
const checkpointer = createCheckpointer();
const graph = buildGraph(checkpointer);

function getGraph() {
  return graph;
}

// Phase → approximate progress %
const PHASE_PROGRESS: Record<Phase, number> = {
  spec: 8,
  planning: 20,
  coding: 65,
  qa_review: 85,
  qa_fixing: 92,
};

export async function startAgent(
  projectSlug: string,
  task: SerializableTask,
  opts: StartAgentOptions = {},
): Promise<void> {
  if (isRunning(task.id)) throw new Error(`Task ${task.id} is already running`);

  const config = getThreadConfig(projectSlug, task.id);
  const ac = getAbort(task.id);

  const initialState = {
    task,
    projectSlug,
    phase: "spec" as Phase,
    allowedTools: opts.allowedTools,
  };

  try {
    const stream = await getGraph().stream(initialState, {
      ...config,
      signal: ac.signal,
      streamMode: "updates",
    });

    for await (const update of stream) {
      if (ac.signal.aborted) break;

      const updateAny = update as Record<string, unknown>;
      const nodeNames = Object.keys(updateAny);
      for (const nodeName of nodeNames) {
        const nodeState = updateAny[nodeName] as Record<string, unknown>;
        const phase = nodeState.phase as Phase | undefined;
        if (phase) {
          emit({
            type: "agent_phase",
            taskId: task.id,
            phase,
            progress: PHASE_PROGRESS[phase] ?? 50,
          });
        }
      }
    }

    emit({ type: "agent_done", taskId: task.id, exitCode: 0 });
    updateBoardStatus(projectSlug, task.id, "completed").catch(console.error);
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      emit({ type: "agent_error", taskId: task.id, message: String(err) });
      updateBoardStatus(projectSlug, task.id, "failed").catch(console.error);
    }
  } finally {
    cancelTask(task.id);
    clearSubscribers(task.id);
  }
}

function updateBoardStatus(slug: string, taskId: number, status: string) {
  const port = process.env.BOARD_SERVER_PORT ?? 4800;
  return fetch(`http://localhost:${port}/api/v1/projects/${slug}/tasks/${taskId}/execution`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, finished_at: new Date().toISOString() }),
  });
}

export function stopAgent(taskId: number) {
  cancelTask(taskId);
}

/** Pause: abort the running graph. Checkpoint preserves state — resume restarts from last node. */
export function pauseAgent(taskId: number) {
  cancelTask(taskId);
  // Board status is updated by the caller (HTTP route or desktop)
}

/** Resume: re-stream from checkpoint. LangGraph resumes from the last saved state. */
export async function resumeAgent(
  projectSlug: string,
  task: SerializableTask,
  opts: StartAgentOptions = {},
): Promise<void> {
  if (isRunning(task.id)) throw new Error(`Task ${task.id} is already running`);

  const config = getThreadConfig(projectSlug, task.id);
  const ac = getAbort(task.id);

  try {
    // Passing null as input tells LangGraph to resume from checkpoint without changing state
    const stream = await getGraph().stream(null, {
      ...config,
      signal: ac.signal,
      streamMode: "updates",
    });

    for await (const update of stream) {
      if (ac.signal.aborted) break;
      const updateAny = update as Record<string, unknown>;
      for (const nodeName of Object.keys(updateAny)) {
        const nodeState = updateAny[nodeName] as Record<string, unknown>;
        const phase = nodeState.phase as Phase | undefined;
        if (phase) {
          emit({
            type: "agent_phase",
            taskId: task.id,
            phase,
            progress: PHASE_PROGRESS[phase] ?? 50,
          });
        }
      }
    }

    emit({ type: "agent_done", taskId: task.id, exitCode: 0 });
    updateBoardStatus(projectSlug, task.id, "completed").catch(console.error);
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      emit({ type: "agent_error", taskId: task.id, message: String(err) });
      updateBoardStatus(projectSlug, task.id, "failed").catch(console.error);
    }
  } finally {
    cancelTask(task.id);
    clearSubscribers(task.id);
  }
}

export async function steerAgent(
  projectSlug: string,
  taskId: number,
  message: string,
  task: SerializableTask,
) {
  if (isRunning(taskId)) throw new Error(`Task ${taskId} is running — pause before steering`);
  // Resume the graph with the steering message injected
  const config = getThreadConfig(projectSlug, taskId);
  await getGraph().invoke({ steeringMessage: message, task }, config);
  emit({ type: "agent_steered", taskId });
}
