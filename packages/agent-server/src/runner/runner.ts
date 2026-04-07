// packages/agent-server/src/runner/runner.ts
import { buildGraph } from '../graph/graph.js';
import { createCheckpointer } from '../checkpointer.js';
import { getThreadConfig, getAbort, cancelTask, isRunning } from './thread-manager.js';
import { emit } from './broadcaster.js';
import type { SerializableTask, Phase, StartAgentOptions } from '../types.js';

const checkpointer = createCheckpointer();
const graph = buildGraph(checkpointer);

// Phase → approximate progress %
const PHASE_PROGRESS: Record<Phase, number> = {
  spec: 8, planning: 20, coding: 65, qa_review: 85, qa_fixing: 92,
};

export async function startAgent(
  projectSlug: string,
  task: SerializableTask,
  opts: StartAgentOptions = {}
): Promise<void> {
  if (isRunning(task.id)) throw new Error(`Task ${task.id} is already running`);

  const config = getThreadConfig(projectSlug, task.id);
  const ac = getAbort(task.id);

  const initialState = {
    task,
    projectSlug,
    phase: 'spec' as Phase,
  };

  try {
    const stream = graph.stream(initialState, {
      ...config,
      signal: ac.signal,
      streamMode: 'updates',
    });

    for await (const update of stream) {
      if (ac.signal.aborted) break;

      const nodeNames = Object.keys(update) as string[];
      for (const nodeName of nodeNames) {
        const nodeState = update[nodeName] as Record<string,unknown>;
        const phase = nodeState.phase as Phase | undefined;
        if (phase) {
          emit({ type: 'agent_phase', taskId: task.id, phase,
            progress: PHASE_PROGRESS[phase] ?? 50 });
        }
        // Emit thought from last message if present
        const msgs = nodeState.messages as Array<{content?:string}> | undefined;
        if (msgs?.length) {
          const last = msgs.at(-1);
          if (last?.content && typeof last.content === 'string') {
            emit({ type: 'agent_thought', taskId: task.id,
              text: last.content, timestamp: new Date().toISOString() });
          }
        }
      }
    }

    emit({ type: 'agent_done', taskId: task.id, exitCode: 0 });
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      emit({ type: 'agent_error', taskId: task.id, message: String(err) });
    }
  } finally {
    cancelTask(task.id);
  }
}

export function stopAgent(taskId: number) {
  cancelTask(taskId);
}

export async function steerAgent(
  projectSlug: string,
  taskId: number,
  message: string,
  task: SerializableTask
) {
  // Resume the graph with the steering message injected
  const config = getThreadConfig(projectSlug, taskId);
  await graph.invoke({ steeringMessage: message, task }, config);
  emit({ type: 'agent_steered', taskId });
}
