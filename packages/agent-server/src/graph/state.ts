// packages/agent-server/src/graph/state.ts
import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { Phase, SerializableTask } from '../types.js';

export const AgentState = Annotation.Root({
  phase:            Annotation<Phase>({ default: () => 'spec', reducer: (_a: Phase, b: Phase) => b }),
  messages:         Annotation<BaseMessage[]>({ default: () => [], reducer: messagesStateReducer }),
  subtasks:         Annotation<Array<{id:number;title:string;status:string;phase?:string}>>({
                      default: () => [], reducer: (_a: Array<{id:number;title:string;status:string;phase?:string}>, b: Array<{id:number;title:string;status:string;phase?:string}>) => b }),
  spec:             Annotation<string>({ default: () => '', reducer: (_a: string, b: string) => b }),
  planSummary:      Annotation<string>({ default: () => '', reducer: (_a: string, b: string) => b }),
  steeringMessage:  Annotation<string | null>({ default: () => null, reducer: (_a: string | null, b: string | null) => b }),
  handoffRequested: Annotation<boolean>({ default: () => false, reducer: (_a: boolean, b: boolean) => b }),
  qaPassed:         Annotation<boolean>({ default: () => false, reducer: (_a: boolean, b: boolean) => b }),
  qaAttempts:       Annotation<number>({ default: () => 0, reducer: (_a: number, b: number) => b }),
  task:             Annotation<SerializableTask>({ reducer: (_a: SerializableTask, b: SerializableTask) => b } as never),
  projectSlug:      Annotation<string>({ reducer: (_a: string, b: string) => b } as never),
  /** Tool allowlist from StartAgentOptions — undefined means all tools enabled */
  allowedTools:     Annotation<string[] | undefined>({ default: () => undefined, reducer: (_a, b) => b }),
});

export type AgentStateType = typeof AgentState.State;
