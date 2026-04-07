// packages/agent-server/src/types.ts

export type Phase =
  | 'spec' | 'planning' | 'coding' | 'qa_review' | 'qa_fixing';

export type ToolAction =
  | 'reading' | 'writing' | 'editing' | 'running' | 'listing' | 'board';

export interface AgentToolEvent {
  tool: string;
  action: ToolAction;
  path: string;
  state: 'start' | 'done' | 'error';
  output?: string[];
}

// Discriminated union of all events the server streams to clients
export type AgentEvent =
  | { type: 'agent_phase';    taskId: number; phase: Phase; progress: number }
  | { type: 'agent_thought';  taskId: number; text: string; timestamp: string }
  | { type: 'agent_tool';     taskId: number } & AgentToolEvent
  | { type: 'agent_subtask';  taskId: number; subtaskId: number; status: string }
  | { type: 'agent_handoff';  taskId: number }
  | { type: 'agent_steered';  taskId: number }
  | { type: 'agent_done';     taskId: number; exitCode: number }
  | { type: 'agent_error';    taskId: number; message: string };

export interface SerializableTask {
  id: number;
  title: string;
  description?: string;
  subtasks: Array<{ id: number; title: string; status: string; phase?: string }>;
  worktree_path?: string;
  default_model?: string;
}

export interface StartAgentOptions {
  model?: string;
  permissionMode?: 'skip-all' | 'auto' | 'allowed-tools';
  allowedTools?: string[];
}
