// packages/agent-server/src/graph/nodes/qa-fixing.ts
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { buildClientOptions } from "../../auth.js";
import { buildFsTools } from "../../tools/fs-tools.js";
import type { AgentStateType } from "../state.js";

export async function qaFixingNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const workDir = state.task.worktree_path ?? process.cwd();
  const fsTools = buildFsTools(workDir);
  const model = new ChatAnthropic({
    ...buildClientOptions(),
    modelName: state.task.default_model ?? "claude-opus-4-6",
    maxTokens: 8192,
  }).bindTools(fsTools);

  const lastQaFeedback = state.messages.at(-1);
  const response = await model.invoke([
    new SystemMessage(
      "You are fixing QA failures. Use the tools to fix failing tests and implementation issues.",
    ),
    new HumanMessage(
      `Fix the failures identified in QA review.\n\nTask: ${state.task.title}\n\nQA Feedback:\n${lastQaFeedback?.content ?? "(none)"}`,
    ),
  ]);

  return { phase: "coding", messages: [response] };
}
