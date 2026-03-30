import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task, TaskStatus } from '../lib/api';
import { TaskCard } from './TaskCard';

interface Props {
  task: Task;
  onClick?: () => void;
  onStatusChange?: (newStatus: TaskStatus) => void;
  onAction?: (action: string, taskId: number) => void;
  repoUrl?: string;
}

export function SortableTaskCard({ task, onClick, onStatusChange, onAction, repoUrl }: Props) {
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
      className={isDragging ? 'opacity-40 cursor-grabbing' : 'opacity-100 cursor-grab'}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCard
        task={task}
        onClick={onClick ?? (() => {})}
        onStatusChange={onStatusChange}
        onAction={onAction}
        repoUrl={repoUrl}
      />
    </div>
  );
}
