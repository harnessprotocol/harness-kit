'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
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

export function DroppableColumn({ status, tasks, onTaskClick, onAddTask, repoUrl }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });
  const meta = COLUMN_META[status as TaskStatus] ?? { label: status, color: 'var(--text-muted)', tooltip: status };
  const taskIds = tasks.map(t => `task-${t.id}`);

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
      {/* Column header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3.5 pt-3 pb-2.5">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: meta.color }}
        />
        <Tooltip text={meta.tooltip} position="bottom">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            {meta.label}
          </span>
        </Tooltip>
        <span className="ml-auto rounded-[10px] bg-[var(--bg-elevated)] px-[7px] py-px text-[11px] font-semibold text-[var(--text-muted)]">
          {tasks.length}
        </span>
      </div>

      {/* Task list — droppable zone */}
      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5 min-h-[80px]"
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div
              className={cn(
                'rounded-md border border-dashed px-3 py-6 text-center text-xs transition-all duration-150',
                isOver
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)]',
              )}
            >
              {isOver ? 'Drop here' : 'No tasks'}
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
