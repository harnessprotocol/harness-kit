import type { TaskStatus } from './api';

export const COLUMNS: TaskStatus[] = ['planning', 'in-progress', 'ai-review', 'human-review', 'done'];

export const COLUMN_META: Record<TaskStatus, { label: string; color: string; tooltip: string }> = {
  planning: { label: 'Planning', color: 'var(--status-planning)', tooltip: 'Not started — tasks being scoped and planned' },
  'in-progress': { label: 'In Progress', color: 'var(--status-in-progress)', tooltip: 'Actively being worked on — a worktree is created automatically' },
  'ai-review': { label: 'AI Review', color: 'var(--status-ai-review)', tooltip: 'Under automated review — Claude is verifying the implementation' },
  'human-review': { label: 'Human Review', color: 'var(--status-human-review)', tooltip: 'Ready for human review — AI review is complete' },
  done: { label: 'Done', color: 'var(--status-done)', tooltip: 'Complete — merged and shipped' },
};
