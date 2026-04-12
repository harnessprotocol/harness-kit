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
  return 'qa_review'; // could also return END to skip QA
}

function qaOutcome(state: AgentStateType): 'qa_fixing' | typeof END {
  if (state.qaPassed) return END;
  if (state.qaAttempts >= 3) return END;    // too many retries, surface to human
  return 'qa_fixing';
}

export function buildGraph(checkpointer: SqliteSaver) {
  const graph = new StateGraph(AgentState)
    .addNode('spec_node',     specNode)
    .addNode('planning_node', planningNode)
    .addNode('coding_node',   codingNode)
    .addNode('qa_review',     qaReviewNode)
    .addNode('qa_fixing',     qaFixingNode)
    .addEdge(START,           'spec_node')
    .addEdge('spec_node',     'planning_node')
    .addEdge('planning_node', 'coding_node')
    .addConditionalEdges('coding_node', shouldQa)
    .addConditionalEdges('qa_review',   qaOutcome)
    .addEdge('qa_fixing',     'coding_node');

  return graph.compile({ checkpointer });
}
