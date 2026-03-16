'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../lib/api';
import { TaskCard } from './TaskCard';

interface Props {
  task: Task;
  onClick?: () => void;
  repoUrl?: string;
}

export function SortableTaskCard({ task, onClick, repoUrl }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `task-${task.id}` });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onClick={onClick} repoUrl={repoUrl} />
    </div>
  );
}
