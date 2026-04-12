// packages/agent-server/src/graph/nodes/qa-review.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { interrupt } from '@langchain/langgraph';
import { buildClientOptions } from '../../auth.js';
import { buildFsTools } from '../../tools/fs-tools.js';
import type { AgentStateType } from '../state.js';

export async function qaReviewNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  if (state.handoffRequested) { interrupt('handoff'); }

  const workDir = state.task.worktree_path ?? process.cwd();
  // QA reviewer only needs read access + bash to run tests.
  // Intersect with state.allowedTools if permission mode is active.
  const QA_TOOLS = ['read_file', 'list_directory', 'bash'];
  const qaTools = state.allowedTools
    ? QA_TOOLS.filter(t => state.allowedTools!.includes(t))
    : QA_TOOLS;
  const fsTools = buildFsTools(workDir, qaTools);
  const model = new ChatAnthropic({ ...buildClientOptions(),
    modelName: state.task.default_model ?? 'claude-opus-4-6', maxTokens: 4096 }).bindTools(fsTools);

  const response = await model.invoke([
    new SystemMessage('You are a QA reviewer. Run tests, check the implementation against acceptance criteria, and report PASS or FAIL with details. Use bash to run tests.'),
    new HumanMessage(`Review implementation for: ${state.task.title}\n\nSpec:\n${state.spec}\n\nCheck: does the implementation satisfy all acceptance criteria?`),
  ]);

  const content = typeof response.content === 'string' ? response.content : '';
  const passed = content.toLowerCase().includes('pass') && !content.toLowerCase().includes('fail');

  // Update graph routing signal via qaAttempts — if passed, set high so routing skips qa_fixing
  return {
    phase: passed ? 'qa_review' : 'qa_fixing',
    qaAttempts: passed ? 99 : state.qaAttempts + 1, // 99 = "passed, skip retry"
    messages: [response],
  };
}
