// packages/agent-server/src/graph/graph.ts
import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentState } from './state.js';
import { specNode } from './nodes/spec.js';
import { planningNode } from './nodes/planning.js';
import { codingNode } from './nodes/coding.js';
import { qaReviewNode } from './nodes/qa-review.js';
import { qaFixingNode } from './nodes/qa-fixing.js';
import type { AgentStateType } from './state.js';
import type { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

function shouldQa(_state: AgentStateType): 'qa_review' | typeof END {
  // Skip QA if task has no tests or is flagged no_qa
  return 'qa_review';
}

function qaOutcome(state: AgentStateType): 'qa_fixing' | typeof END {
  if (state.qaAttempts >= 99) return END;   // passed
  if (state.qaAttempts >= 3) return END;    // too many retries, surface to human
  return 'qa_fixing';
}

export function buildGraph(checkpointer: SqliteSaver) {
  const graph = new StateGraph(AgentState)
    .addNode('spec',       specNode)
    .addNode('planning',   planningNode)
    .addNode('coding',     codingNode)
    .addNode('qa_review',  qaReviewNode)
    .addNode('qa_fixing',  qaFixingNode)
    .addEdge(START,        'spec')
    .addEdge('spec',       'planning')
    .addEdge('planning',   'coding')
    .addConditionalEdges('coding',    shouldQa)
    .addConditionalEdges('qa_review', qaOutcome)
    .addEdge('qa_fixing',  'coding');

  return graph.compile({ checkpointer });
}
