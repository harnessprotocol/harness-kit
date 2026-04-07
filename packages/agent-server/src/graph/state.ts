// packages/agent-server/src/graph/state.ts
import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { Phase, SerializableTask } from '../types.js';

export const AgentState = Annotation.Root({
  phase:            Annotation<Phase>({ default: () => 'spec', reducer: (_, b) => b }),
  messages:         Annotation<BaseMessage[]>({ default: () => [], reducer: messagesStateReducer }),
  subtasks:         Annotation<Array<{id:number;title:string;status:string;phase?:string}>>({
                      default: () => [], reducer: (_, b) => b }),
  spec:             Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  planSummary:      Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  steeringMessage:  Annotation<string | null>({ default: () => null, reducer: (_, b) => b }),
  handoffRequested: Annotation<boolean>({ default: () => false, reducer: (_, b) => b }),
  qaAttempts:       Annotation<number>({ default: () => 0, reducer: (_, b) => b }),
  task:             Annotation<SerializableTask>({ reducer: (_, b) => b } as never),
  projectSlug:      Annotation<string>({ reducer: (_, b) => b } as never),
});

export type AgentStateType = typeof AgentState.State;
