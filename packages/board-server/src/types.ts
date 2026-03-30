export type TaskStatus = 'planning' | 'in-progress' | 'ai-review' | 'human-review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type EpicStatus = 'active' | 'completed' | 'archived';
export type CommentAuthor = 'claude' | 'user';

export type PhaseName = 'spec' | 'planning' | 'coding' | 'qa';
export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type ExecutionPhase = 'idle' | PhaseName | 'complete' | 'failed';
export type ExecutionStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Comment {
  author: CommentAuthor;
  timestamp: string; // ISO 8601
  body: string;
}

export interface Subtask {
  id: number;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  completed_at?: string;
}

export interface PhaseConfig {
  name: PhaseName;
  model: string;           // e.g. 'claude-opus-4-6', 'claude-sonnet-4-6'
  thinking_level?: string; // 'high' | 'medium' | 'low'
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
  phase_progress: number;    // 0-100 within current phase
  overall_progress: number;  // 0-100 across all phases
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
  icon: string;  // lucide icon name: 'sparkles' | 'brain' | 'scale' | 'zap'
  phase_models: Record<PhaseName, string>;
  phase_thinking: Record<PhaseName, string>;
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  category?: string;   // 'feature' | 'bug_fix' | 'refactor' | 'docs' | 'security' | 'performance'
  complexity?: string; // 'trivial' | 'small' | 'medium' | 'large' | 'complex'
  branch?: string;
  worktree_path?: string;
  use_worktree: boolean;       // true = create isolated git worktree (default)
  linked_commits: string[];
  comments: Comment[];
  subtasks: Subtask[];         // checklist items
  execution?: TaskExecution;   // runtime execution state
  phase_config?: PhaseConfig[]; // per-task phase model overrides
  agent_profile?: string;      // references AgentProfile.id
  reference_images: string[];  // image IDs stored in image-store
  auto_title?: boolean;        // true if title was auto-generated from description
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
  version: 2;
  agent_profiles?: AgentProfile[];
  epics: Epic[];
  created_at: string;
  updated_at: string;
}

// Repo link file schema (.board.yaml in repo root)
export interface RepoBoardLink {
  project: string; // project slug
  repo_path?: string; // optional: override for worktree placement
}
