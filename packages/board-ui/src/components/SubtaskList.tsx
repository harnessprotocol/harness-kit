import { useState, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface Subtask {
  id: number;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface Props {
  subtasks: Subtask[];
  onToggle: (id: number, completed: boolean) => Promise<void>;
  onAdd: (title: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  disabled?: boolean;
}

export function SubtaskList({ subtasks, onToggle, onAdd, onDelete, disabled }: Props) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleAdd() {
    const t = newTitle.trim();
    if (!t) return;
    setAdding(true);
    try {
      await onAdd(t);
      setNewTitle('');
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id: number, currentStatus: Subtask['status']) {
    setPendingId(id);
    try {
      await onToggle(id, currentStatus !== 'completed');
    } finally {
      setPendingId(null);
    }
  }

  const completed = subtasks.filter(s => s.status === 'completed').length;

  return (
    <div className="flex flex-col gap-2">
      {/* Progress header */}
      {subtasks.length > 0 && (
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{completed}/{subtasks.length} completed</span>
          <span>{Math.round(completed / subtasks.length * 100)}%</span>
        </div>
      )}

      {/* Subtask list */}
      <div className="flex flex-col gap-1">
        {subtasks.map(subtask => {
          const isCompleted = subtask.status === 'completed';
          const isPending = pendingId === subtask.id;
          return (
            <div
              key={subtask.id}
              className="group flex items-start gap-2 rounded-md border border-transparent px-1 py-1 hover:border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]"
            >
              <input
                type="checkbox"
                checked={isCompleted}
                disabled={disabled || isPending}
                onChange={() => handleToggle(subtask.id, subtask.status)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--cta-bg)]"
              />
              <span
                className={cn(
                  'flex-1 text-[13px] leading-snug',
                  isCompleted ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]',
                )}
              >
                {subtask.title}
              </span>
              <button
                type="button"
                onClick={() => !disabled && onDelete(subtask.id)}
                className="invisible cursor-pointer rounded border-none bg-transparent p-0.5 text-[var(--text-muted)] hover:text-[var(--destructive)] group-hover:visible"
                title="Remove subtask"
                disabled={disabled}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add subtask form */}
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder="Add a subtask…"
          disabled={disabled || adding}
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1.5 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled || adding || !newTitle.trim()}
          className="cursor-pointer rounded-md border-none bg-[var(--bg-elevated)] px-2 py-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          title="Add subtask"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
