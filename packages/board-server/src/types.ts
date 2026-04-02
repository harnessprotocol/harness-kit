export type TaskStatus = 'backlog' | 'planning' | 'in-progress' | 'ai-review' | 'human-review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type EpicStatus = 'active' | 'completed' | 'archived';
export type CommentAuthor = 'claude' | 'user';

export interface Comment {
  author: CommentAuthor;
  timestamp: string; // ISO 8601
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
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
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

// Repo link file schema (.board.yaml in repo root)
export interface RepoBoardLink {
  project: string; // project slug
  repo_path?: string; // optional: override for worktree placement
}
