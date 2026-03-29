'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import type { Epic, TaskStatus, TaskPriority } from '../lib/api';
import { COLUMNS, COLUMN_META } from '../lib/columns';
import { cn } from '../lib/utils';
import { api } from '../lib/api';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical'];

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
  high: { label: 'High', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  medium: { label: 'Medium', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' },
  low: { label: 'Low', className: 'bg-gray-500/10 text-[var(--text-muted)] border-gray-500/20' },
};

interface Props {
  open: boolean;
  projectSlug: string;
  epics: Epic[];
  defaultEpicId?: number;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onCreated: () => void;
}

export function TaskForm({ open, projectSlug, epics, defaultEpicId, defaultStatus, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [epicId, setEpicId] = useState<number>(defaultEpicId ?? epics[0]?.id ?? 0);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus ?? 'planning');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setEpicId(defaultEpicId ?? epics[0]?.id ?? 0);
      setPriority('medium');
      setStatus(defaultStatus ?? 'planning');
      setError('');
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open, defaultEpicId, defaultStatus, epics]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) { setError('Title is required'); return; }
    if (!epicId) { setError('Select an epic'); return; }
    setSubmitting(true);
    setError('');
    try {
      const task = await api.tasks.create(projectSlug, epicId, {
        title: trimmed,
        description: description.trim() || undefined,
        priority,
      });
      // If a specific status was requested, move it from default planning
      if (status !== 'planning') {
        await api.tasks.update(projectSlug, task.id, { status });
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/50"
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className="fixed top-1/2 left-1/2 z-[70] flex w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6"
          >
            <h2 className="m-0 text-base font-semibold text-[var(--text-primary)]">
              New task
            </h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {/* Epic selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">Epic</label>
                <select
                  value={epicId}
                  onChange={e => setEpicId(Number(e.target.value))}
                  className="w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 font-[inherit] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                >
                  {epics.map(ep => (
                    <option key={ep.id} value={ep.id}>{ep.name}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">Title</label>
                <input
                  ref={titleRef}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 font-[inherit] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">
                  Description <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Add context, acceptance criteria, links…"
                  rows={4}
                  className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 font-[inherit] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Status selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {COLUMNS.map(s => {
                    const meta = COLUMN_META[s];
                    const isActive = status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer',
                          isActive
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:border-[var(--border)]',
                        )}
                      >
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Priority selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">Priority</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITIES.map(p => {
                    const cfg = PRIORITY_CONFIG[p];
                    const isActive = priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors cursor-pointer',
                          isActive
                            ? cn(cfg.className, 'ring-1 ring-current/20')
                            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:border-[var(--border)]',
                        )}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-red-500/[0.08] px-2.5 py-1.5 text-xs text-[var(--blocked)]">
                  {error}
                </div>
              )}

              <div className="mt-1 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-md border border-[var(--border)] bg-transparent px-4 py-[7px] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={cn(
                    'rounded-md border-none bg-[var(--accent)] px-5 py-[7px] text-[13px] font-medium text-white',
                    submitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:opacity-90',
                  )}
                >
                  {submitting ? 'Creating…' : 'Create task'}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
