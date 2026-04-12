// apps/desktop/src/lib/agent-api.ts
// Typed HTTP + WebSocket client for the agent-server on port 4801.

import { invoke } from '@tauri-apps/api/core';

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

// Lazily fetched token — resolved once and cached for the session lifetime.
let _tokenPromise: Promise<string> | null = null;

function getToken(): Promise<string> {
  if (!_tokenPromise) {
    _tokenPromise = invoke<string>('get_agent_server_token');
  }
  return _tokenPromise;
}

function url(slug: string, taskId: number, path: string) {
  return `${AGENT_BASE}/projects/${slug}/tasks/${taskId}/${path}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

export const agentApi = {
  async start(slug: string, task: SerializableTask, opts?: StartAgentOptions) {
    return fetch(url(slug, task.id, 'start'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ task, opts }),
    });
  },

  async stop(slug: string, taskId: number) {
    const token = await getToken();
    return fetch(url(slug, taskId, 'stop'), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  async pause(slug: string, taskId: number) {
    const token = await getToken();
    return fetch(url(slug, taskId, 'pause'), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  },

  async resume(slug: string, task: SerializableTask, opts?: StartAgentOptions) {
    return fetch(url(slug, task.id, 'resume'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ task, opts }),
    });
  },

  async steer(slug: string, taskId: number, task: SerializableTask, message: string) {
    return fetch(url(slug, taskId, 'steer'), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ task, message }),
    });
  },

  async status(slug: string, taskId: number) {
    const token = await getToken();
    return fetch(url(slug, taskId, 'status'), {
      headers: { 'Authorization': `Bearer ${token}` },
    }).then(r => r.json() as Promise<{ running: boolean }>);
  },

  /** Open a WebSocket and receive AgentEvents for a task */
  async subscribe(taskId: number, onEvent: (e: AgentEvent) => void): Promise<() => void> {
    const token = await getToken();
    const ws = new WebSocket(`ws://localhost:4801/ws?taskId=${taskId}&token=${token}`);
    ws.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data as string) as AgentEvent); } catch { /* skip */ }
    };
    return () => ws.close();
  },
};
