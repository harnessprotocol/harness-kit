import type { TaskStatus } from './board-api';

export const COLUMNS: TaskStatus[] = ['backlog', 'planning', 'in-progress', 'ai-review', 'human-review', 'done'];

export const COLUMN_META: Record<TaskStatus, { label: string; color: string; tooltip: string }> = {
  backlog: { label: 'Backlog', color: 'var(--status-backlog)', tooltip: 'Captured ideas and future work — drag to Planning when ready to scope' },
  planning: { label: 'Planning', color: 'var(--status-planning)', tooltip: 'Not started — tasks being scoped and planned' },
  'in-progress': { label: 'In Progress', color: 'var(--status-in-progress)', tooltip: 'Actively being worked on — a worktree is created automatically' },
  'ai-review': { label: 'AI Review', color: 'var(--status-ai-review)', tooltip: 'Under automated review — Claude is verifying the implementation' },
  'human-review': { label: 'Human Review', color: 'var(--status-human-review)', tooltip: 'Ready for human review — AI review is complete' },
  done: { label: 'Done', color: 'var(--status-done)', tooltip: 'Complete — merged and shipped' },
};

export const EMPTY_STATE_COPY: Record<TaskStatus, { title: string; subtitle: string }> = {
  backlog:        { title: 'Backlog is empty',       subtitle: 'Captured ideas will appear here' },
  planning:       { title: 'No tasks planned',       subtitle: 'Add a task to get started' },
  'in-progress':  { title: 'Nothing running',        subtitle: 'Start a task from Planning — a worktree is created automatically' },
  'ai-review':    { title: 'No tasks in AI review',  subtitle: 'Claude will verify implementations here' },
  'human-review': { title: 'Nothing to review',      subtitle: 'Tasks pass AI review before landing here' },
  done:           { title: 'No completed tasks',     subtitle: 'Merged and shipped work appears here' },
};
