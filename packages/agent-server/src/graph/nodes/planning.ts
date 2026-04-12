// packages/agent-server/src/graph/nodes/planning.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage } from '@langchain/core/messages';
import { interrupt } from '@langchain/langgraph';
import { buildClientOptions } from '../../auth.js';
import { emit } from '../../runner/broadcaster.js';
import type { AgentStateType } from '../state.js';

interface SubtaskPlan { title: string; description?: string; }

export async function planningNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  if (state.handoffRequested) { interrupt('handoff'); }

  const model = new ChatAnthropic({
    ...buildClientOptions(),
    modelName: state.task.default_model ?? 'claude-opus-4-6',
    maxTokens: 4096,
  });

  const steeringCtx = state.steeringMessage
    ? `\n\nAdditional instruction: ${state.steeringMessage}`
    : '';

  const response = await model.invoke([
    new HumanMessage(
      `Based on this implementation spec, create a detailed subtask list.\n\n` +
      `SPEC:\n${state.spec}\n\n` +
      `Task: ${state.task.title}` +
      steeringCtx +
      `\n\nReturn ONLY a JSON array of objects with shape {title: string, description?: string}. ` +
      `8-15 subtasks. No markdown fences. Pure JSON.`
    )
  ]);

  const raw = typeof response.content === 'string'
    ? response.content.trim()
    : (response.content[0] as {text?:string}).text?.trim() ?? '[]';

  // Strip markdown fences the model sometimes adds
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  let subtaskPlans: SubtaskPlan[] = [];
  try { subtaskPlans = JSON.parse(cleaned); } catch { subtaskPlans = []; }

  // Write subtasks to board via HTTP API
  const BOARD = `http://localhost:${process.env.BOARD_SERVER_PORT ?? 4800}`;
  const createdSubtasks = await Promise.all(
    subtaskPlans.map(async (s, _i) => {
      const res = await fetch(
        `${BOARD}/api/v1/projects/${state.projectSlug}/tasks/${state.task.id}/subtasks`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: s.title, description: s.description }) }
      );
      const created = await res.json() as { id: number; title: string };
      emit({ type: 'agent_subtask', taskId: state.task.id, subtaskId: created.id, status: 'pending' });
      return { id: created.id, title: created.title, status: 'pending', phase: 'coding' };
    })
  );

  return {
    phase: 'coding',
    subtasks: createdSubtasks,
    planSummary: `${createdSubtasks.length} subtasks planned`,
    steeringMessage: null,
    messages: [response],
  };
}
