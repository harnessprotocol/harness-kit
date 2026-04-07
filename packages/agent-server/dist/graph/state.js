// packages/agent-server/src/graph/state.ts
import { Annotation, messagesStateReducer } from '@langchain/langgraph';
export const AgentState = Annotation.Root({
    phase: Annotation({ default: () => 'spec', reducer: (_a, b) => b }),
    messages: Annotation({ default: () => [], reducer: messagesStateReducer }),
    subtasks: Annotation({
        default: () => [], reducer: (_a, b) => b
    }),
    spec: Annotation({ default: () => '', reducer: (_a, b) => b }),
    planSummary: Annotation({ default: () => '', reducer: (_a, b) => b }),
    steeringMessage: Annotation({ default: () => null, reducer: (_a, b) => b }),
    handoffRequested: Annotation({ default: () => false, reducer: (_a, b) => b }),
    qaAttempts: Annotation({ default: () => 0, reducer: (_a, b) => b }),
    task: Annotation({ reducer: (_a, b) => b }),
    projectSlug: Annotation({ reducer: (_a, b) => b }),
});
