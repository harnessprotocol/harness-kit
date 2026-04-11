// packages/agent-server/src/graph/nodes/coding.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { interrupt } from '@langchain/langgraph';
import { buildClientOptions } from '../../auth.js';
import { buildFsTools } from '../../tools/fs-tools.js';
import { buildBoardTools } from '../../tools/board-tools.js';
import { emit } from '../../runner/broadcaster.js';
import type { AgentStateType } from '../state.js';
import type { ToolAction } from '../../types.js';

const MAX_STEPS = 80;

const TOOL_ACTIONS: Record<string, ToolAction> = {
  read_file: 'reading',
  list_directory: 'listing',
  write_file: 'writing',
  edit_file: 'editing',
  bash: 'running',
};

function toolAction(name: string): ToolAction {
  return TOOL_ACTIONS[name] ?? 'board';
}

export async function codingNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  if (state.handoffRequested) { interrupt('handoff'); }

  const workDir = state.task.worktree_path ?? process.cwd();
  const fsTools = buildFsTools(workDir, state.allowedTools);
  const boardTools = await buildBoardTools();
  const tools = [...fsTools, ...boardTools];

  const model = new ChatAnthropic({
    ...buildClientOptions(),
    modelName: state.task.default_model ?? 'claude-opus-4-6',
    maxTokens: 8192,
  }).bindTools(tools);

  const pendingSubtasks = state.subtasks.filter(s => s.status !== 'completed');
  const steeringCtx = state.steeringMessage
    ? `\n\n<steering>${state.steeringMessage}</steering>`
    : '';

  const systemPrompt =
    `You are an expert software engineer implementing a task.\n\n` +
    `SPEC:\n${state.spec}\n\n` +
    `PLAN SUMMARY: ${state.planSummary}\n\n` +
    `PENDING SUBTASKS:\n${pendingSubtasks.map(s => `- [${s.id}] ${s.title}`).join('\n')}\n\n` +
    `Work through each subtask methodically. After completing a subtask, call ` +
    `board_update_subtask to mark it completed. Read files before editing them.` +
    steeringCtx;

  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(`Work on: ${state.task.title}`),
    ...state.messages,
  ];

  // Agentic loop
  let stepCount = 0;
  let currentMessages = messages;

  while (stepCount < MAX_STEPS) {
    if (state.handoffRequested) { interrupt('handoff'); }

    const response = await model.invoke(currentMessages);
    currentMessages = [...currentMessages, response];
    stepCount++;

    // Emit any prose content as a thought
    if (typeof response.content === 'string' && response.content.trim()) {
      emit({ type: 'agent_thought', taskId: state.task.id,
        text: response.content.trim(), timestamp: new Date().toISOString() });
    }

    // If no tool calls, agent is done
    if (!response.tool_calls || response.tool_calls.length === 0) break;

    // Execute tool calls and emit agent_tool events
    for (const tc of response.tool_calls) {
      const t = tools.find(x => x.name === tc.name);
      if (!t) continue;

      const action = toolAction(tc.name);
      const path = (tc.args as Record<string, unknown>).path as string | undefined
        ?? (tc.args as Record<string, unknown>).command as string | undefined
        ?? '';

      emit({ type: 'agent_tool', taskId: state.task.id,
        tool: tc.name, action, path, state: 'start' });

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (t as any).invoke(tc.args as Record<string, unknown>);
        const output = String(result).split('\n').slice(0, 100);
        emit({ type: 'agent_tool', taskId: state.task.id,
          tool: tc.name, action, path, state: 'done', output });
        currentMessages.push(new ToolMessage({ content: String(result), tool_call_id: tc.id! }));
      } catch (err) {
        emit({ type: 'agent_tool', taskId: state.task.id,
          tool: tc.name, action, path, state: 'error', output: [String(err)] });
        currentMessages.push(new ToolMessage({ content: String(err), tool_call_id: tc.id! }));
      }
    }
  }

  return {
    phase: 'qa_review',
    messages: currentMessages.slice(messages.length), // only new messages
    steeringMessage: null,
  };
}
