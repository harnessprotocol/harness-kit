// packages/agent-server/src/runner/runner.ts
import { buildGraph } from '../graph/graph.js';
import { createCheckpointer } from '../checkpointer.js';
import { getThreadConfig, getAbort, cancelTask, isRunning } from './thread-manager.js';
import { emit } from './broadcaster.js';
const checkpointer = createCheckpointer();
const graph = buildGraph(checkpointer);
// Phase → approximate progress %
const PHASE_PROGRESS = {
    spec: 8, planning: 20, coding: 65, qa_review: 85, qa_fixing: 92,
};
export async function startAgent(projectSlug, task, opts = {}) {
    if (isRunning(task.id))
        throw new Error(`Task ${task.id} is already running`);
    const config = getThreadConfig(projectSlug, task.id);
    const ac = getAbort(task.id);
    const initialState = {
        task,
        projectSlug,
        phase: 'spec',
    };
    try {
        const stream = await graph.stream(initialState, {
            ...config,
            signal: ac.signal,
            streamMode: 'updates',
        });
        for await (const update of stream) {
            if (ac.signal.aborted)
                break;
            const updateAny = update;
            const nodeNames = Object.keys(updateAny);
            for (const nodeName of nodeNames) {
                const nodeState = updateAny[nodeName];
                const phase = nodeState.phase;
                if (phase) {
                    emit({ type: 'agent_phase', taskId: task.id, phase,
                        progress: PHASE_PROGRESS[phase] ?? 50 });
                }
                // Emit thought from last message if present
                const msgs = nodeState.messages;
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
    }
    catch (err) {
        if (err.name !== 'AbortError') {
            emit({ type: 'agent_error', taskId: task.id, message: String(err) });
        }
    }
    finally {
        cancelTask(task.id);
    }
}
export function stopAgent(taskId) {
    cancelTask(taskId);
}
export async function steerAgent(projectSlug, taskId, message, task) {
    // Resume the graph with the steering message injected
    const config = getThreadConfig(projectSlug, taskId);
    await graph.invoke({ steeringMessage: message, task }, config);
    emit({ type: 'agent_steered', taskId });
}
