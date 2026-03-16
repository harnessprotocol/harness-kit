import type { TaskStatus } from './board-api';

export const COLUMNS: TaskStatus[] = ['backlog', 'in-progress', 'review', 'done'];

export const COLUMN_META: Record<TaskStatus, { label: string; color: string; tooltip: string }> = {
  backlog: { label: 'Backlog', color: 'var(--status-backlog)', tooltip: 'Not started — tasks waiting to be picked up' },
  'in-progress': { label: 'In Progress', color: 'var(--status-in-progress)', tooltip: 'Actively being worked on — a worktree is created automatically' },
  review: { label: 'Review', color: 'var(--status-review)', tooltip: 'Ready for human review — Claude has flagged this as complete' },
  done: { label: 'Done', color: 'var(--status-done)', tooltip: 'Complete — merged and shipped' },
};
