'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task, TaskStatus } from '../lib/api';
import { COLUMN_META } from '../lib/columns';
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
      style={{
        width: 280,
        minWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        background: isOver ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        borderRadius: 10,
        border: `1px solid ${isOver ? 'var(--accent)' : 'var(--border-subtle)'}`,
        overflow: 'hidden',
        maxHeight: '100%',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {/* Column header */}
      <div
        style={{
          padding: '12px 14px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: meta.color,
            flexShrink: 0,
          }}
        />
        <Tooltip text={meta.tooltip} position="bottom">
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
            {meta.label}
          </span>
        </Tooltip>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            background: 'var(--bg-elevated)',
            borderRadius: 10,
            padding: '1px 7px',
          }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Task list — droppable zone */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 80,
        }}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div
              style={{
                padding: '24px 12px',
                textAlign: 'center',
                color: isOver ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12,
                borderRadius: 6,
                border: `1px dashed ${isOver ? 'var(--accent)' : 'var(--border-subtle)'}`,
                transition: 'all 0.15s',
              }}
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

      {/* Add task button — only in Backlog */}
      {status === 'backlog' && <Tooltip text="Create a new task" position="top">
        <button
          onClick={onAddTask}
          style={{
            margin: '0 10px 10px',
            padding: '6px',
            background: 'transparent',
            border: '1px dashed var(--border)',
            borderRadius: 6,
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            transition: 'all 0.1s',
            flexShrink: 0,
            width: 'calc(100% - 20px)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
            (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
          }}
        >
          + Add task
        </button>
      </Tooltip>}
    </div>
  );
}
