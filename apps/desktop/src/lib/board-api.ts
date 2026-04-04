// Board API client — talks directly to board-server on :4800
export const BOARD_SERVER_BASE = 'http://localhost:4800';
const BASE = `${BOARD_SERVER_BASE}/api/v1`;

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
    updateSettings: (slug: string, body: Partial<Pick<Project, 'default_harness' | 'default_model' | 'max_concurrent'>>) =>
      apiFetch<Project>(`/projects/${slug}/settings`, { method: 'PATCH', body: JSON.stringify(body) }),
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
    create: (slug: string, epicId: number, body: { title: string; description?: string; priority?: TaskPriority }) =>
      apiFetch<Task>(`/projects/${slug}/epics/${epicId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (slug: string, taskId: number, body: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'category' | 'complexity' | 'no_worktree' | 'default_harness' | 'default_model'>>) =>
      apiFetch<Task>(`/projects/${slug}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    updateExecution: (slug: string, taskId: number, body: Partial<Omit<TaskExecution, 'terminal_id'>>) =>
      apiFetch<Task>(`/projects/${slug}/tasks/${taskId}/execution`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  subtasks: {
    create: (slug: string, taskId: number, body: { title: string; description?: string }) =>
      apiFetch<Subtask>(`/projects/${slug}/tasks/${taskId}/subtasks`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (slug: string, taskId: number, subtaskId: number, body: Partial<Pick<Subtask, 'title' | 'description' | 'status'>>) =>
      apiFetch<Subtask>(`/projects/${slug}/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    remove: (slug: string, taskId: number, subtaskId: number) =>
      apiFetch<void>(`/projects/${slug}/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'DELETE',
      }),
  },
  comments: {
    create: (slug: string, taskId: number, body: { author: 'claude' | 'user'; body: string }) =>
      apiFetch<Comment>(`/projects/${slug}/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
};

// Types (mirrors board-server/src/types.ts)
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'backlog' | 'planning' | 'in-progress' | 'ai-review' | 'human-review' | 'done';
export type EpicStatus = 'active' | 'completed' | 'archived';
export type SubtaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type TaskCategory = 'feature' | 'bug_fix' | 'refactoring' | 'docs' | 'security' | 'performance' | 'ui_ux' | 'infrastructure' | 'testing';
export type TaskComplexity = 'trivial' | 'small' | 'medium' | 'large' | 'complex';
export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export interface TaskExecution {
  status: ExecutionStatus;
  harness_id: string;
  model?: string;
  started_at?: string;
  finished_at?: string;
  exit_code?: number;
}

export interface Subtask {
  id: number;
  title: string;
  description?: string;
  status: SubtaskStatus;
  files: string[];
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
  no_worktree?: boolean;
  blocked?: boolean;
  blocked_reason?: string;
  category?: TaskCategory;
  complexity?: TaskComplexity;
  subtasks: Subtask[];
  next_subtask_id: number;
  execution?: TaskExecution;
  default_harness?: string;
  default_model?: string;
  created_at: string;
  updated_at: string;
  // enriched by list_tasks
  project_slug?: string;
  epic_id?: number;
  epic_name?: string;
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
  version: 1;
  epics: Epic[];
  default_harness?: string;
  default_model?: string;
  max_concurrent?: number;
  created_at: string;
  updated_at: string;
}
