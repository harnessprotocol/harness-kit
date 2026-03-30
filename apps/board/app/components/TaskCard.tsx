'use client';

import type { Task, TaskPriority } from '../lib/api';
import { COLUMN_META } from '../lib/columns';
import { cn } from '../lib/utils';
import { Tooltip } from './Tooltip';

interface Props {
  task: Task;
  onClick?: () => void;
  repoUrl?: string;
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
  high: { label: 'High', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  medium: { label: 'Medium', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' },
  low: { label: 'Low', className: 'bg-gray-500/10 text-[var(--text-muted)] border-gray-500/20' },
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

export function TaskCard({ task, onClick, repoUrl }: Props) {
  const statusMeta = COLUMN_META[task.status];
  const priorityCfg = task.priority ? PRIORITY_CONFIG[task.priority] : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border p-2.5 cursor-pointer',
        'transition-[border-color,background] duration-100',
        'bg-[var(--bg-elevated)]',
        task.blocked
          ? 'border-[var(--blocked)] hover:border-[var(--blocked)]'
          : 'border-[var(--border)] hover:border-[var(--accent)]',
        'hover:bg-[var(--bg-hover)]',
      )}
    >
      {/* Header: title + id */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium leading-snug text-[var(--text-primary)]">
          {task.title}
        </span>
        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
          #{task.id}
        </span>
      </div>

      {/* Description preview */}
      {task.description && (
        <p className="m-0 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
          {task.description}
        </p>
      )}

      {/* Badges row: status, priority, epic */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Status badge */}
        <span
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-px text-[10px] font-medium text-[var(--text-muted)]"
        >
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ backgroundColor: statusMeta?.color }}
          />
          {statusMeta?.label ?? task.status}
        </span>

        {/* Priority label */}
        {priorityCfg && (
          <span
            className={cn(
              'rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide',
              priorityCfg.className,
            )}
          >
            {priorityCfg.label}
          </span>
        )}

        {/* Epic badge */}
        {task.epic_name && (
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-px text-[11px] text-[var(--text-muted)]">
            {task.epic_name}
          </span>
        )}
      </div>

      {/* Footer row */}
      <div className="mt-0.5 flex items-center gap-2">
        {/* Blocked indicator */}
        {task.blocked && (
          <Tooltip text="Blocked — click to see reason" position="top">
            <span className="rounded bg-red-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-[var(--blocked)]">
              Blocked
            </span>
          </Tooltip>
        )}

        {/* Branch */}
        {task.branch && (
          repoUrl ? (
            <a
              href={`${repoUrl}/tree/${task.branch}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="max-w-[140px] truncate font-mono text-[11px] text-[var(--text-muted)] no-underline hover:text-[var(--accent)]"
            >
              {task.branch}
            </a>
          ) : (
            <span className="max-w-[140px] truncate font-mono text-[11px] text-[var(--text-muted)]">
              {task.branch}
            </span>
          )
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Comment count */}
        {task.comments.length > 0 && (
          <Tooltip text={`${task.comments.length} comment(s) — click to view`} position="top">
            <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
              {task.comments.length}
            </span>
          </Tooltip>
        )}

        {/* Relative timestamp */}
        <Tooltip text={new Date(task.updated_at).toLocaleString()} position="top">
          <span className="text-[10px] text-[var(--text-muted)]">
            {relativeTime(task.updated_at)}
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
