import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { Task, TaskPriority, TaskStatus } from '../../lib/board-api';
import { COLUMN_META, COLUMNS } from '../../lib/board-columns';
import { CommentThread } from './CommentThread';
import { api } from '../../lib/board-api';
import { openInClaudeCode } from '../../lib/open-in-claude';

interface Props {
  task: Task | null;
  projectSlug: string;
  onClose: () => void;
  onTaskUpdated: () => void;
  repoUrl?: string;
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bgColor: string; borderColor: string }> = {
  critical: { label: 'Critical', color: '#dc2626', bgColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' },
  high: { label: 'High', color: '#ea580c', bgColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.2)' },
  medium: { label: 'Medium', color: '#ca8a04', bgColor: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.2)' },
  low: { label: 'Low', color: 'var(--text-muted)', bgColor: 'rgba(107,114,128,0.1)', borderColor: 'rgba(107,114,128,0.2)' },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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

  const pillBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9999,
    border: '1px solid var(--border-subtle)',
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
    transition: 'all 0.15s',
  };

  const pillActive: React.CSSProperties = {
    ...pillBase,
    borderColor: 'var(--accent)',
    background: 'rgba(var(--accent-rgb, 99,102,241), 0.1)',
    color: 'var(--text-primary)',
  };

  return (
    <AnimatePresence>
      {task && (
        <div className="board-scope">
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 40,
            }}
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 420,
              background: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                flexShrink: 0,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    #{task.id}
                  </span>
                  {task.epic_name && (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        background: 'var(--bg-elevated)',
                        borderRadius: 10,
                        padding: '1px 6px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {task.epic_name}
                    </span>
                  )}
                  {task.blocked && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--blocked)',
                        background: 'rgba(220,38,38,0.1)',
                        borderRadius: 4,
                        padding: '1px 5px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Blocked
                    </span>
                  )}
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    lineHeight: 1.3,
                  }}
                >
                  {task.title}
                </h2>
                {(['backlog', 'planning', 'in-progress'] as string[]).includes(task.status) && (
                <button
                  onClick={() => openInClaudeCode(task)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 8,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                  }}
                >
                  <span style={{ fontSize: 10 }}>{'\u25B6'}</span>
                  Open in Claude Code
                </button>
                )}
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 4,
                  borderRadius: 4,
                  flexShrink: 0,
                }}
                title="Close (Esc)"
              >
                {'\u2715'}
              </button>
            </div>

            {/* Scrollable body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
              }}
            >
              {/* Status */}
              <Section title="Status">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {COLUMNS.map(status => {
                    const meta = COLUMN_META[status];
                    const isActive = task.status === status;
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        disabled={updatingStatus}
                        style={{
                          ...(isActive ? pillActive : pillBase),
                          opacity: updatingStatus ? 0.5 : 1,
                          cursor: updatingStatus ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: meta.color,
                            display: 'inline-block',
                          }}
                        />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Priority */}
              <Section title="Priority">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map(priority => {
                    const cfg = PRIORITY_CONFIG[priority];
                    const isActive = task.priority === priority;
                    return (
                      <button
                        key={priority}
                        onClick={() => handlePriorityChange(priority)}
                        disabled={updatingPriority}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: 9999,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          cursor: updatingPriority ? 'not-allowed' : 'pointer',
                          opacity: updatingPriority ? 0.5 : 1,
                          transition: 'all 0.15s',
                          border: isActive ? `1px solid ${cfg.borderColor}` : '1px solid var(--border-subtle)',
                          background: isActive ? cfg.bgColor : 'var(--bg-elevated)',
                          color: isActive ? cfg.color : 'var(--text-muted)',
                        }}
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
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {task.description}
                  </div>
                </Section>
              )}

              {/* Branch + Worktree */}
              {(task.branch || task.worktree_path) && (
                <Section title="Git">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {task.branch && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>Branch</span>
                        {repoUrl ? (
                          <a
                            href={`${repoUrl}/tree/${task.branch}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                              background: 'var(--bg-elevated)',
                              borderRadius: 4,
                              padding: '2px 6px',
                              border: '1px solid var(--border-subtle)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            {task.branch}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        ) : (
                          <code
                            style={{
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                              background: 'var(--bg-elevated)',
                              borderRadius: 4,
                              padding: '2px 6px',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {task.branch}
                          </code>
                        )}
                      </div>
                    )}
                    {task.worktree_path && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>Worktree</span>
                        <code
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            background: 'var(--bg-elevated)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            border: '1px solid var(--border-subtle)',
                            wordBreak: 'break-all',
                          }}
                        >
                          {task.worktree_path}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(task.worktree_path!);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          }}
                          title="Copy path"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: 11,
                            padding: '2px 4px',
                            borderRadius: 4,
                          }}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {task.linked_commits.map(sha => (
                      repoUrl ? (
                        <a
                          key={sha}
                          href={`${repoUrl}/commit/${sha}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-elevated)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            border: '1px solid var(--border-subtle)',
                            fontFamily: 'monospace',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            width: 'fit-content',
                          }}
                        >
                          {sha.slice(0, 8)}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      ) : (
                        <code
                          key={sha}
                          style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-elevated)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            border: '1px solid var(--border-subtle)',
                            fontFamily: 'monospace',
                          }}
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
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--blocked)',
                      background: 'rgba(220,38,38,0.08)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      border: '1px solid rgba(220,38,38,0.2)',
                    }}
                  >
                    {task.blocked_reason}
                  </div>
                </Section>
              )}

              {/* Comments */}
              <Section title={`Comments (${task.comments.length})`}>
                <CommentThread comments={task.comments} onAdd={handleAddComment} />
              </Section>

              {/* Timestamps */}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                <span>Created {new Date(task.created_at).toLocaleDateString()}</span>
                <span>Updated {new Date(task.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
