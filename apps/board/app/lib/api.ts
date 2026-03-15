// Shared API client — uses /api/v1 (proxied to board-server in dev via next.config.ts)
const BASE = '/api/v1';

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
    update: (slug: string, body: Partial<Pick<Project, 'name' | 'description' | 'color' | 'repo_url'>>) =>
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
    create: (slug: string, epicId: number, body: { title: string; description?: string }) =>
      apiFetch<Task>(`/projects/${slug}/epics/${epicId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (slug: string, taskId: number, body: Partial<Pick<Task, 'title' | 'description' | 'status' | 'no_worktree'>>) =>
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
};

// Types (mirrors board-server/src/types.ts)
export type TaskStatus = 'backlog' | 'in-progress' | 'review' | 'done';
export type EpicStatus = 'active' | 'completed' | 'archived';

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
  branch?: string;
  worktree_path?: string;
  linked_commits: string[];
  comments: Comment[];
  no_worktree?: boolean;
  blocked?: boolean;
  blocked_reason?: string;
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
  created_at: string;
  updated_at: string;
}
