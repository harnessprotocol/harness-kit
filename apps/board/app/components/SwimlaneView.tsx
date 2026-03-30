'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Epic, Task, TaskStatus } from '../lib/api';
import { COLUMNS, COLUMN_META } from '../lib/columns';
import { cn } from '../lib/utils';
import { SortableTaskCard } from './SortableTaskCard';
import { Tooltip } from './Tooltip';

function SwimCell({
  epicId,
  status,
  tasks,
  onTaskClick,
  repoUrl,
}: {
  epicId: number;
  status: TaskStatus;
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  repoUrl?: string;
}) {
  const droppableId = `swim-${epicId}-${status}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  const taskIds = tasks.map(t => `task-${t.id}`);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-w-[200px] min-h-[80px] rounded-[6px] border p-2 flex flex-col gap-1.5 transition-[background,border-color] duration-150',
        isOver
          ? 'bg-[var(--bg-elevated)] border-[var(--accent)]'
          : 'bg-transparent border-[var(--border-subtle)]',
      )}
    >
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {tasks.length === 0 ? (
          <div
            className={cn(
              'text-[11px] text-center py-4 italic',
              isOver ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
            )}
          >
            {isOver ? 'Drop here' : '\u2014'}
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
  );
}

interface Props {
  epics: Epic[];
  onTaskClick?: (task: Task) => void;
  onAddTask?: (status: string, epicId: number) => void;
  repoUrl?: string;
}

export function SwimlaneView({ epics, onTaskClick, onAddTask, repoUrl }: Props) {
  const activeEpics = epics.filter(e => e.status === 'active');

  if (activeEpics.length === 0) {
    return (
      <div className="p-10 text-[var(--text-muted)] text-[13px] text-center">
        No active epics. Create one with <code>create_epic</code>.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overflow-y-auto flex-1 p-5">
      <table className="border-collapse border-spacing-0 w-full min-w-[900px]" style={{ borderCollapse: 'separate' }}>
        <thead>
          <tr>
            <th className="w-[160px] min-w-[160px] px-3 py-2 text-left text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] border-b border-[var(--border-subtle)] sticky left-0 bg-[var(--bg-base)] z-[2]">
              Epic
            </th>
            {COLUMNS.map(col => (
              <th
                key={col}
                className="px-3 py-2 text-left border-b border-[var(--border-subtle)]"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-[7px] rounded-full shrink-0"
                    style={{ background: COLUMN_META[col].color }}
                  />
                  <Tooltip text={COLUMN_META[col].tooltip} position="bottom">
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                      {COLUMN_META[col].label}
                    </span>
                  </Tooltip>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {activeEpics.map((epic, rowIdx) => {
            const tasksByStatus = Object.fromEntries(
              COLUMNS.map(col => [
                col,
                epic.tasks
                  .filter(t => t.status === col)
                  .map(t => ({ ...t, epic_id: epic.id, epic_name: epic.name })),
              ])
            ) as Record<TaskStatus, Task[]>;

            return (
              <tr key={epic.id}>
                <td
                  className={cn(
                    'px-3 py-2.5 align-top sticky left-0 bg-[var(--bg-base)] z-[1]',
                    rowIdx < activeEpics.length - 1 && 'border-b border-[var(--border-subtle)]',
                  )}
                >
                  <div className="font-semibold text-[13px] text-[var(--text-primary)] mb-1">
                    {epic.name}
                  </div>
                  {epic.description && (
                    <div className="text-[11px] text-[var(--text-muted)] leading-[1.4]">
                      {epic.description}
                    </div>
                  )}
                  <div className="text-[11px] text-[var(--text-muted)] mt-1.5">
                    {epic.tasks.length} task{epic.tasks.length !== 1 ? 's' : ''}
                  </div>
                </td>

                {COLUMNS.map(col => (
                  <td
                    key={col}
                    className={cn(
                      'p-2 align-top',
                      rowIdx < activeEpics.length - 1 && 'border-b border-[var(--border-subtle)]',
                    )}
                  >
                    <SwimCell
                      epicId={epic.id}
                      status={col}
                      tasks={tasksByStatus[col] ?? []}
                      onTaskClick={onTaskClick}
                      repoUrl={repoUrl}
                    />
                    {col === 'planning' && (
                      <Tooltip text={`Create a new task in ${epic.name}`} position="top">
                        <button
                          onClick={() => onAddTask?.(col, epic.id)}
                          className="mt-1.5 w-full rounded-[4px] border border-dashed border-[var(--border-subtle)] bg-transparent py-1 px-2 text-[11px] text-[var(--text-muted)] cursor-pointer transition-all duration-100 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          + Add
                        </button>
                      </Tooltip>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
