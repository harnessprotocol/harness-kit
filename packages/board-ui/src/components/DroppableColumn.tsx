import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Bot,
  Eye,
  CheckCircle2,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import type { Task, TaskStatus } from '../lib/api';
import { COLUMN_META } from '../lib/columns';
import { cn } from '../lib/utils';
import { SortableTaskCard } from './SortableTaskCard';
import { Tooltip } from './Tooltip';

interface Props {
  status: string;
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  onAddTask?: () => void;
  repoUrl?: string;
}

/* ── Per-status color for the 3px top border ── */
const COLUMN_COLORS: Record<string, string> = {
  'planning': 'var(--muted-foreground)',
  'in-progress': 'var(--info)',
  'ai-review': 'var(--warning)',
  'human-review': '#a855f7',
  'done': 'var(--success)',
};

/* ── CSS class for the 3px top border (defined in globals.css) ── */
const HEADER_CLASS: Record<string, string> = {
  'planning': 'column-header-planning',
  'in-progress': 'column-header-in-progress',
  'ai-review': 'column-header-ai-review',
  'human-review': 'column-header-human-review',
  'done': 'column-header-done',
};

/* ── Empty state config per column ── */
const EMPTY_STATES: Record<string, { icon: LucideIcon; title: string; subtitle: string }> = {
  'planning': { icon: Inbox, title: 'No tasks planned', subtitle: 'Add a task to get started' },
  'in-progress': { icon: Loader2, title: 'Nothing running', subtitle: 'Start a task from Planning' },
  'ai-review': { icon: Bot, title: 'No tasks in review', subtitle: 'AI will review completed tasks' },
  'human-review': { icon: Eye, title: 'Nothing to review', subtitle: 'Tasks await your approval here' },
  'done': { icon: CheckCircle2, title: 'No completed tasks', subtitle: 'Finished tasks appear here' },
};

export function DroppableColumn({ status, tasks, onTaskClick, onAddTask, repoUrl }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });
  const meta = COLUMN_META[status as TaskStatus] ?? { label: status, color: 'var(--text-muted)', tooltip: status };
  const taskIds = tasks.map(t => `task-${t.id}`);
  const emptyState = EMPTY_STATES[status];
  const headerClass = HEADER_CLASS[status] ?? '';
  const statusColor = COLUMN_COLORS[status] ?? 'var(--muted-foreground)';

  const [collapsed, setCollapsed] = useState(false);

  /* ── Collapsed strip ── */
  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] transition-all duration-200',
          headerClass,
          isOver && 'border-[var(--primary)]',
        )}
        style={{ width: '3rem', minWidth: '3rem', maxWidth: '3rem' }}
      >
        {/* Expand button */}
        <div className="flex justify-center p-2 border-b border-[var(--border-subtle)]">
          <Tooltip text={`Expand ${meta.label}`} position="right">
            <button
              onClick={() => setCollapsed(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
              aria-label={`Expand ${meta.label} column`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        {/* Rotated title + count */}
        <div className="flex flex-1 flex-col items-center justify-center">
          <div
            className="flex items-center gap-2 whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-[1.5rem] px-1.5 rounded-full bg-[var(--secondary)] text-xs font-semibold text-[var(--muted-foreground)]">
              {tasks.length}
            </span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {meta.label}
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Expanded column ── */
  const EmptyIcon = emptyState?.icon;

  return (
    <div
      className={cn(
        'flex min-w-[320px] flex-1 flex-col overflow-hidden rounded-2xl border max-h-full',
        'bg-[var(--card)] transition-all duration-200',
        headerClass,
        isOver
          ? 'border-[var(--primary)]'
          : 'border-[var(--border-subtle)]',
      )}
      style={isOver ? { background: 'linear-gradient(to bottom, rgba(214, 216, 118, 0.08), transparent)' } : undefined}
    >
      {/* ── Column header ── */}
      <div className={cn(
        'flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3',
      )}>
        {/* Collapse button */}
        <Tooltip text={`Collapse ${meta.label}`} position="bottom">
          <button
            onClick={() => setCollapsed(true)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
            aria-label={`Collapse ${meta.label} column`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </Tooltip>

        {/* Status dot */}
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: statusColor }}
        />

        {/* Column label */}
        <Tooltip text={meta.tooltip} position="bottom">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {meta.label}
          </span>
        </Tooltip>

        {/* Count badge — pill */}
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-[var(--secondary)] min-w-[1.5rem] h-[1.5rem] px-1.5 text-xs font-semibold tabular-nums text-[var(--muted-foreground)]">
          {tasks.length}
        </span>
      </div>

      {/* ── Task list / droppable zone ── */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-3 overflow-y-auto p-3 min-h-[120px]',
          'transition-colors duration-150',
        )}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className={cn(
              'empty-column-dropzone flex flex-col items-center justify-center py-6',
              isOver && 'is-over',
            )}>
              {isOver ? (
                <>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(214,216,118,0.2)] mb-2">
                    <Plus className="h-4 w-4 text-[var(--primary)]" />
                  </div>
                  <span className="text-sm font-medium text-[var(--primary)]">Drop here</span>
                </>
              ) : (
                <>
                  {EmptyIcon && (
                    <EmptyIcon className="h-6 w-6 text-[var(--muted-foreground)] opacity-50 empty-state-bounce" />
                  )}
                  <span className="mt-2 text-sm font-medium text-[var(--muted-foreground)] opacity-70">
                    {emptyState?.title}
                  </span>
                  <span className="mt-0.5 text-xs text-[var(--muted-foreground)] opacity-50">
                    {emptyState?.subtitle}
                  </span>
                </>
              )}
            </div>
          ) : (
            tasks.map(task => (
              <SortableTaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick?.(task)}
                repoUrl={repoUrl}
              />
            ))
          )}
        </SortableContext>
      </div>

      {/* ── "+ Add task" button — Planning column only ── */}
      {status === 'planning' && (
        <div className="px-3 pb-3">
          <Tooltip text="Create a new task" position="top">
            <button
              onClick={onAddTask}
              className={cn(
                'flex w-full items-center justify-center gap-1.5',
                'rounded-lg border border-dashed border-[var(--border)] bg-transparent',
                'py-2 text-xs font-medium text-[var(--text-muted)] cursor-pointer',
                'transition-all duration-150',
                'hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[rgba(214,216,118,0.04)]',
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              Add task
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
