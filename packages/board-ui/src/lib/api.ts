// Shared board API client with configurable base URL
let BASE = '/api/v1';

/** Configure the API base URL. Call once at app startup. */
export function configureBoardApi(baseUrl: string) {
  BASE = baseUrl;
}

/** Get the current base URL (for WebSocket URL derivation) */
export function getBoardApiBase(): string {
  return BASE;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  projects: {
    list: () => apiFetch<Project[]>('/projects'),
    get: (slug: string) => apiFetch<Project>(`/projects/${slug}`),
    create: (body: { name: string; description?: string; color?: string; repo_url?: string }) =>
      apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (slug: string, body: Partial<Pick<Project, 'description' | 'color' | 'repo_url'>>) =>
      apiFetch<Project>(`/projects/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  epics: {
    create: (slug: string, body: { name: string; description?: string }) =>
      apiFetch<Epic>(`/projects/${slug}/epics`, { method: 'POST', body: JSON.stringify(body) }),
  },
  tasks: {
    list: (slug: string, params?: { status?: string; epic_id?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.epic_id) q.set('epic_id', String(params.epic_id));
      return apiFetch<Task[]>(`/projects/${slug}/tasks${q.size ? `?${q}` : ''}`);
    },
    create: (slug: string, epicId: number, body: {
      title: string;
      description?: string;
      priority?: TaskPriority;
      agent_profile?: string;
      phase_config?: PhaseConfig[];
      category?: string;
      complexity?: string;
      use_worktree?: boolean;
      auto_title?: boolean;
    }) =>
      apiFetch<Task>(`/projects/${slug}/epics/${epicId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (slug: string, taskId: number, body: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'agent_profile' | 'category' | 'complexity' | 'use_worktree'>>) =>
      apiFetch<Task>(`/projects/${slug}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  comments: {
    create: (slug: string, taskId: number, body: { author: 'claude' | 'user'; body: string }) =>
      apiFetch<Comment>(`/projects/${slug}/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  subtasks: {
    create: (slug: string, taskId: number, body: { title: string }) =>
      apiFetch<Subtask>(`/projects/${slug}/tasks/${taskId}/subtasks`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (slug: string, taskId: number, subtaskId: number, body: { status?: Subtask['status']; title?: string }) =>
      apiFetch<Subtask>(`/projects/${slug}/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (slug: string, taskId: number, subtaskId: number) =>
      apiFetch<void>(`/projects/${slug}/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'DELETE',
      }),
  },
  execution: {
    start: (slug: string, taskId: number, body?: { agent_profile?: string; phase_config?: PhaseConfig[] }) =>
      apiFetch<{ ok: boolean }>(`/projects/${slug}/tasks/${taskId}/execute`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    stop: (slug: string, taskId: number) =>
      apiFetch<{ ok: boolean }>(`/projects/${slug}/tasks/${taskId}/stop`, {
        method: 'POST',
      }),
  },
  logs: {
    tail: async (slug: string, taskId: number, lines = 100): Promise<string[]> => {
      const data = await apiFetch<{ lines: string[] }>(`/projects/${slug}/tasks/${taskId}/logs?tail=${lines}`);
      return data.lines;
    },
  },
  profiles: {
    list: () => apiFetch<AgentProfile[]>('/profiles'),
  },
};

// Types (mirrors board-server/src/types.ts)
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'planning' | 'in-progress' | 'ai-review' | 'human-review' | 'done';
export type EpicStatus = 'active' | 'completed' | 'archived';

export interface Subtask {
  id: number;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  completed_at?: string;
}

export type PhaseName = 'spec' | 'planning' | 'coding' | 'qa';
export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type ExecutionPhase = 'idle' | PhaseName | 'complete' | 'failed';
export type ExecutionStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PhaseConfig {
  name: PhaseName;
  model: string;
  thinking_level?: string;
  enabled: boolean;
}

export interface PhaseProgress {
  name: PhaseName;
  status: PhaseStatus;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface TaskExecution {
  status: ExecutionStatus;
  phase: ExecutionPhase;
  phase_progress: number;
  overall_progress: number;
  current_subtask?: string;
  phases: PhaseProgress[];
  agent_profile?: string;
  pid?: number;
  log_file?: string;
  started_at?: string;
  completed_at?: string;
  message?: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  icon: string;
  phase_models: Record<PhaseName, string>;
  phase_thinking: Record<PhaseName, string>;
}

export interface Comment {
  author: 'claude' | 'user';
  timestamp: string;
  body: string;
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  branch?: string;
  worktree_path?: string;
  linked_commits: string[];
  comments: Comment[];
  blocked?: boolean;
  blocked_reason?: string;
  created_at: string;
  updated_at: string;
  // enriched by list_tasks
  project_slug?: string;
  epic_id?: number;
  epic_name?: string;
  // execution and agent fields
  use_worktree?: boolean;
  subtasks?: Subtask[];
  execution?: TaskExecution;
  phase_config?: PhaseConfig[];
  agent_profile?: string;
  reference_images?: string[];
  category?: string;
  complexity?: string;
  auto_title?: boolean;
}

export interface Epic {
  id: number;
  name: string;
  description?: string;
  status: EpicStatus;
  tasks: Task[];
  created_at: string;
  updated_at: string;
}

export interface Project {
  name: string;
  slug: string;
  description?: string;
  color?: string;
  repo_url?: string;
  next_id: number;
  version: 2;
  epics: Epic[];
  created_at: string;
  updated_at: string;
}
