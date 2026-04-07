export type TaskStatus = 'backlog' | 'planning' | 'in-progress' | 'ai-review' | 'human-review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type EpicStatus = 'active' | 'completed' | 'archived';
export type CommentAuthor = 'claude' | 'user';
export type SubtaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type TaskCategory = 'feature' | 'bug_fix' | 'refactoring' | 'docs' | 'security' | 'performance' | 'ui_ux' | 'infrastructure' | 'testing';
export type TaskComplexity = 'trivial' | 'small' | 'medium' | 'large' | 'complex';
export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export interface TaskExecution {
  status: ExecutionStatus;
  harness_id?: string;
  model?: string;
  started_at?: string;
  finished_at?: string;
  exit_code?: number;
  phase?: string;
  thread_id?: string;
}

export interface Subtask {
  id: number;
  title: string;
  description?: string;
  status: SubtaskStatus;
  files: string[];
  phase?: string;
}

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
  linkedFeatureId?: string;
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
  default_harness?: string;
  default_model?: string;
  max_concurrent?: number;
  created_at: string;
  updated_at: string;
}

// Repo link file schema (.board.yaml in repo root)
export interface RepoBoardLink {
  project: string; // project slug
  repo_path?: string; // optional: override for worktree placement
}
