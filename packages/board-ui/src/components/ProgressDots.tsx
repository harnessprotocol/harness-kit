import { cn } from '../lib/utils';

interface Subtask {
  id: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface Props {
  subtasks: Subtask[];
  maxVisible?: number;
  className?: string;
}

const DOT_COLORS: Record<Subtask['status'], string> = {
  completed:   'bg-[var(--success)]',
  in_progress: 'bg-[var(--info)] animate-pulse',
  failed:      'bg-[var(--destructive)]',
  pending:     'bg-[var(--border)] border border-[var(--border-subtle)]',
};

export function ProgressDots({ subtasks, maxVisible = 10, className }: Props) {
  if (!subtasks.length) return null;

  const visible = subtasks.slice(0, maxVisible);
  const overflow = subtasks.length - maxVisible;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {visible.map(subtask => (
        <span
          key={subtask.id}
          className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT_COLORS[subtask.status])}
          title={subtask.status}
        />
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-[var(--text-muted)]">+{overflow}</span>
      )}
    </div>
  );
}
