'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { Task, TaskPriority, TaskStatus } from '../lib/api';
import { COLUMN_META, COLUMNS } from '../lib/columns';
import { cn } from '../lib/utils';
import { CommentThread } from './CommentThread';
import { api } from '../lib/api';

interface Props {
  task: Task | null;
  projectSlug: string;
  onClose: () => void;
  onTaskUpdated: () => void;
  repoUrl?: string;
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
  high: { label: 'High', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  medium: { label: 'Medium', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' },
  low: { label: 'Low', className: 'bg-gray-500/10 text-[var(--text-muted)] border-gray-500/20' },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

export function TaskDetailPanel({ task, projectSlug, onClose, onTaskUpdated, repoUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);

  async function handleAddComment(body: string) {
    if (!task) return;
    await api.comments.create(projectSlug, task.id, { author: 'user', body });
    onTaskUpdated();
  }

  async function handleStatusChange(newStatus: TaskStatus) {
    if (!task || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      await api.tasks.update(projectSlug, task.id, { status: newStatus });
      onTaskUpdated();
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handlePriorityChange(newPriority: TaskPriority) {
    if (!task || updatingPriority) return;
    setUpdatingPriority(true);
    try {
      await api.tasks.update(projectSlug, task.id, { priority: newPriority });
      onTaskUpdated();
    } finally {
      setUpdatingPriority(false);
    }
  }

  return (
    <AnimatePresence>
      {task && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed top-0 right-0 bottom-0 z-50 flex w-[420px] flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg-surface)]"
          >
            {/* Header */}
            <div className="flex shrink-0 items-start gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    #{task.id}
                  </span>
                  {task.epic_name && (
                    <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-px text-[11px] text-[var(--text-muted)]">
                      {task.epic_name}
                    </span>
                  )}
                  {task.blocked && (
                    <span className="rounded bg-red-500/10 px-1.5 py-px text-[10px] font-bold uppercase text-[var(--blocked)]">
                      Blocked
                    </span>
                  )}
                </div>
                <h2 className="m-0 text-base font-semibold leading-snug text-[var(--text-primary)]">
                  {task.title}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 cursor-pointer rounded border-none bg-transparent p-1 text-lg leading-none text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
              {/* Status */}
              <Section title="Status">
                <div className="flex flex-wrap gap-1.5">
                  {COLUMNS.map(status => {
                    const meta = COLUMN_META[status];
                    const isActive = task.status === status;
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        disabled={updatingStatus}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                          'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
                          isActive
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:border-[var(--border)] hover:text-[var(--text-secondary)]',
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
              </Section>

              {/* Priority */}
              <Section title="Priority">
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map(priority => {
                    const cfg = PRIORITY_CONFIG[priority];
                    const isActive = task.priority === priority;
                    return (
                      <button
                        key={priority}
                        onClick={() => handlePriorityChange(priority)}
                        disabled={updatingPriority}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors',
                          'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
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
              </Section>

              {/* Description */}
              {task.description && (
                <Section title="Description">
                  <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    {task.description}
                  </div>
                </Section>
              )}

              {/* Branch + Worktree */}
              {(task.branch || task.worktree_path) && (
                <Section title="Git">
                  <div className="flex flex-col gap-1.5">
                    {task.branch && (
                      <div className="flex items-center gap-2">
                        <span className="w-[60px] shrink-0 text-[11px] text-[var(--text-muted)]">Branch</span>
                        {repoUrl ? (
                          <a
                            href={`${repoUrl}/tree/${task.branch}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)] no-underline hover:text-[var(--accent)]"
                          >
                            {task.branch}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        ) : (
                          <code className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)]">
                            {task.branch}
                          </code>
                        )}
                      </div>
                    )}
                    {task.worktree_path && (
                      <div className="flex items-center gap-2">
                        <span className="w-[60px] shrink-0 text-[11px] text-[var(--text-muted)]">Worktree</span>
                        <code className="break-all rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                          {task.worktree_path}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(task.worktree_path!);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          }}
                          title="Copy path"
                          className="cursor-pointer rounded border-none bg-transparent px-1 py-0.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          {copied ? 'Copied!' : '\u2398'}
                        </button>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Linked commits */}
              {task.linked_commits.length > 0 && (
                <Section title={`Commits (${task.linked_commits.length})`}>
                  <div className="flex flex-col gap-1">
                    {task.linked_commits.map(sha => (
                      repoUrl ? (
                        <a
                          key={sha}
                          href={`${repoUrl}/commit/${sha}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-fit items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-secondary)] no-underline hover:text-[var(--accent)]"
                        >
                          {sha.slice(0, 8)}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      ) : (
                        <code
                          key={sha}
                          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-secondary)]"
                        >
                          {sha.slice(0, 12)}
                        </code>
                      )
                    ))}
                  </div>
                </Section>
              )}

              {/* Blocked reason */}
              {task.blocked && task.blocked_reason && (
                <Section title="Blocked reason">
                  <div className="rounded-md border border-red-500/20 bg-red-500/[0.08] p-2.5 text-[13px] text-[var(--blocked)]">
                    {task.blocked_reason}
                  </div>
                </Section>
              )}

              {/* Comments */}
              <Section title={`Comments (${task.comments.length})`}>
                <CommentThread comments={task.comments} onAdd={handleAddComment} />
              </Section>

              {/* Timestamps */}
              <div className="flex gap-4 text-[11px] text-[var(--text-muted)]">
                <span>Created {new Date(task.created_at).toLocaleDateString()}</span>
                <span>Updated {new Date(task.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
