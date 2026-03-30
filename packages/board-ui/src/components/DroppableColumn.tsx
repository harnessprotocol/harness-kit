import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Inbox, Loader2, Bot, Eye, CheckCircle2 } from 'lucide-react';
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
  isOver?: boolean;
  repoUrl?: string;
}

const EMPTY_STATES: Record<TaskStatus, { icon: React.ReactNode; message: string; hint: string }> = {
  planning: {
    icon: <Inbox size={18} />,
    message: 'No tasks planned',
    hint: 'Add a task to get started',
  },
  'in-progress': {
    icon: <Loader2 size={18} />,
    message: 'Nothing in progress',
    hint: 'Drag a task here to start',
  },
  'ai-review': {
    icon: <Bot size={18} />,
    message: 'No AI reviews',
    hint: 'Tasks move here after coding',
  },
  'human-review': {
    icon: <Eye size={18} />,
    message: 'Nothing to review',
    hint: 'Tasks await your review',
  },
  done: {
    icon: <CheckCircle2 size={18} />,
    message: 'All clear!',
    hint: 'Completed tasks appear here',
  },
};

const HEADER_CLASS: Record<TaskStatus, string> = {
  planning: 'column-header-planning',
  'in-progress': 'column-header-in-progress',
  'ai-review': 'column-header-ai-review',
  'human-review': 'column-header-human-review',
  done: 'column-header-done',
};

export function DroppableColumn({ status, tasks, onTaskClick, onAddTask, repoUrl }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });
  const meta = COLUMN_META[status as TaskStatus] ?? { label: status, color: 'var(--text-muted)', tooltip: status };
  const taskIds = tasks.map(t => `task-${t.id}`);
  const emptyState = EMPTY_STATES[status as TaskStatus];
  const headerClass = HEADER_CLASS[status as TaskStatus] ?? '';

  return (
    <div
      className={cn(
        'flex min-w-[220px] flex-1 flex-col overflow-hidden rounded-[10px] border max-h-full',
        'transition-[background,border-color] duration-150',
        isOver
          ? 'bg-[var(--bg-elevated)] border-[var(--accent)]'
          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)]',
      )}
    >
      {/* Column header — with top border accent */}
      <div className={cn(
        'flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3.5 pt-3 pb-2.5 rounded-t-[9px]',
        headerClass,
      )}>
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: meta.color }}
        />
        <Tooltip text={meta.tooltip} position="bottom">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            {meta.label}
          </span>
        </Tooltip>
        {/* Count badge — pill shape */}
        <span className="ml-auto rounded-full bg-[var(--bg-elevated)] px-2 py-px text-[11px] font-semibold tabular-nums text-[var(--text-muted)] min-w-[20px] text-center">
          {tasks.length}
        </span>
      </div>

      {/* Task list — droppable zone */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 overflow-y-auto p-2.5 min-h-[80px]',
          'transition-colors duration-150',
          isOver && 'bg-[var(--bg-elevated)]',
        )}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className={cn(
              'empty-column-dropzone flex items-center justify-center rounded-lg p-8 text-center',
              isOver && 'drop-zone-active',
            )}>
              <div className="flex flex-col items-center gap-2">
                <span className="text-[var(--text-muted)]">{emptyState?.icon}</span>
                <span className="text-xs text-[var(--text-muted)]">{emptyState?.message}</span>
                <span className="text-[11px] text-[var(--text-muted)] opacity-60">{emptyState?.hint}</span>
              </div>
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

      {/* Add task button — only in Planning */}
      {status === 'planning' && (
        <Tooltip text="Create a new task" position="top">
          <button
            onClick={onAddTask}
            className={cn(
              'mx-2.5 mb-2.5 shrink-0 flex items-center justify-center gap-1',
              'rounded-md border border-dashed border-[var(--border)] bg-transparent',
              'p-1.5 text-xs text-[var(--text-muted)] cursor-pointer',
              'transition-all duration-100',
              'hover:border-[var(--accent)] hover:text-[var(--accent)]',
            )}
          >
            + Add task
          </button>
        </Tooltip>
      )}
    </div>
  );
}
