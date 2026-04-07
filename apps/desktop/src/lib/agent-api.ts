// apps/desktop/src/lib/agent-api.ts
// Typed HTTP + WebSocket client for the agent-server on port 4801.

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
  | ({ type: 'agent_tool';    taskId: number } & AgentToolEvent)
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

const AGENT_BASE = 'http://localhost:4801';

function url(slug: string, taskId: number, path: string) {
  return `${AGENT_BASE}/projects/${slug}/tasks/${taskId}/${path}`;
}

export const agentApi = {
  start(slug: string, task: SerializableTask, opts?: StartAgentOptions) {
    return fetch(url(slug, task.id, 'start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, opts }),
    });
  },

  stop(slug: string, taskId: number) {
    return fetch(url(slug, taskId, 'stop'), { method: 'POST' });
  },

  steer(slug: string, taskId: number, task: SerializableTask, message: string) {
    return fetch(url(slug, taskId, 'steer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, message }),
    });
  },

  status(slug: string, taskId: number) {
    return fetch(url(slug, taskId, 'status')).then(r => r.json() as Promise<{ running: boolean }>);
  },

  /** Open a WebSocket and receive AgentEvents for a task */
  subscribe(taskId: number, onEvent: (e: AgentEvent) => void): () => void {
    const ws = new WebSocket(`ws://localhost:4801/ws?taskId=${taskId}`);
    ws.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data as string) as AgentEvent); } catch { /* skip */ }
    };
    return () => ws.close();
  },
};
