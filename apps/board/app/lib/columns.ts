import type { TaskStatus } from './api';

export const COLUMNS: TaskStatus[] = ['backlog', 'in-progress', 'review', 'done'];

export const COLUMN_META: Record<TaskStatus, { label: string; color: string; tooltip: string }> = {
  backlog: { label: 'Backlog', color: 'var(--status-backlog)', tooltip: 'Not started \u2014 tasks waiting to be picked up' },
  'in-progress': { label: 'In Progress', color: 'var(--status-in-progress)', tooltip: 'Actively being worked on \u2014 a worktree is created automatically' },
  review: { label: 'Review', color: 'var(--status-review)', tooltip: 'Ready for human review \u2014 Claude has flagged this as complete' },
  done: { label: 'Done', color: 'var(--status-done)', tooltip: 'Complete \u2014 merged and shipped' },
};
