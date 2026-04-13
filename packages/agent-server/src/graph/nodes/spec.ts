// packages/agent-server/src/graph/nodes/spec.ts
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { buildClientOptions } from "../../auth.js";
import type { AgentStateType } from "../state.js";

export async function specNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  if (state.handoffRequested) {
    interrupt("handoff");
  }

  const model = new ChatAnthropic({
    ...buildClientOptions(),
    modelName: state.task.default_model ?? "claude-opus-4-6",
    maxTokens: 4096,
  });

  const steeringCtx = state.steeringMessage
    ? `\n\nAdditional instruction from user: ${state.steeringMessage}`
    : "";

  const response = await model.invoke([
    new HumanMessage(
      `You are a senior engineer writing an implementation spec.\n\n` +
        `Task: ${state.task.title}\n` +
        `Description: ${state.task.description ?? "(none)"}\n` +
        `Existing subtasks: ${state.task.subtasks.map((s) => `- ${s.title}`).join("\n") || "(none)"}` +
        steeringCtx +
        `\n\nWrite a concise implementation spec (500-1000 words) covering: ` +
        `approach, key files to touch, edge cases, and acceptance criteria.`,
    ),
  ]);

  const spec =
    typeof response.content === "string"
      ? response.content
      : response.content.map((c) => (c as { text?: string }).text ?? "").join("");

  return { phase: "planning", spec, steeringMessage: null, messages: [response] };
}
