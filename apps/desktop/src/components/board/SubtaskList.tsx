import { useState } from 'react';
import type { Subtask, SubtaskStatus } from '../../lib/board-api';
import { api } from '../../lib/board-api';

interface Props {
  subtasks: Subtask[];
  projectSlug: string;
  taskId: number;
  onUpdated: () => void;
}

// ── Status styling ───────────────────────────────────────────

const STATUS_CONFIG: Record<SubtaskStatus, {
  icon: string; color: string; bg: string; border: string; label: string;
}> = {
  completed: { icon: '✓', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.3)', label: 'Completed' },
  in_progress: { icon: '◔', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)', label: 'In Progress' },
  failed: { icon: '✗', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', label: 'Failed' },
  pending: { icon: '○', color: 'var(--text-muted)', bg: 'rgba(100,116,139,0.05)', border: 'var(--border-subtle)', label: 'Pending' },
};

function nextStatus(current: SubtaskStatus): SubtaskStatus {
  if (current === 'pending') return 'in_progress';
  if (current === 'in_progress') return 'completed';
  return 'pending';
}

// ── Component ────────────────────────────────────────────────

export function SubtaskList({ subtasks, projectSlug, taskId, onUpdated }: Props) {
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const completed = subtasks.filter(s => s.status === 'completed').length;
  const percent = subtasks.length > 0 ? Math.round((completed / subtasks.length) * 100) : 0;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await api.subtasks.create(projectSlug, taskId, {
        title: trimmed,
        description: newDescription.trim() || undefined,
      });
      setNewTitle('');
      setNewDescription('');
      setShowDescription(false);
      onUpdated();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(subtask: Subtask) {
    await api.subtasks.update(projectSlug, taskId, subtask.id, { status: nextStatus(subtask.status) });
    onUpdated();
  }

  async function handleDelete(subtaskId: number) {
    await api.subtasks.remove(projectSlug, taskId, subtaskId);
    onUpdated();
  }

  async function handleSaveTitle(subtaskId: number) {
    const trimmed = editTitle.trim();
    if (!trimmed) { setEditingId(null); return; }
    await api.subtasks.update(projectSlug, taskId, subtaskId, { title: trimmed });
    setEditingId(null);
    onUpdated();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Progress summary */}
      {subtasks.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingBottom: 10, marginBottom: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontSize: 12, color: 'var(--text-muted)',
        }}>
          <span>{completed} of {subtasks.length} completed</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{percent}%</span>
        </div>
      )}

      {/* Subtask cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {subtasks.map((subtask, index) => {
          const cfg = STATUS_CONFIG[subtask.status];
          const isExpanded = expandedId === subtask.id;
          const hasDetails = !!(subtask.description || subtask.files.length > 0);

          return (
            <div
              key={subtask.id}
              style={{
                borderRadius: 12,
                border: `1px solid ${cfg.border}`,
                background: cfg.bg,
                transition: 'all 0.2s',
                overflow: 'hidden',
                ...(subtask.status === 'in_progress' ? { boxShadow: `0 0 0 1px ${cfg.border}` } : {}),
              }}
              onMouseEnter={() => setHoveredId(subtask.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Card header */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', cursor: hasDetails ? 'pointer' : 'default',
                  width: '100%', textAlign: 'left',
                }}
                onClick={() => hasDetails && setExpandedId(isExpanded ? null : subtask.id)}
              >
                {/* Status icon — clickable */}
                <button
                  onClick={e => { e.stopPropagation(); handleToggleStatus(subtask); }}
                  title={`${cfg.label} — click to advance`}
                  style={{
                    width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                    color: cfg.color, background: 'transparent', border: 'none',
                    cursor: 'pointer', borderRadius: 4, padding: 0,
                    ...(subtask.status === 'in_progress' ? { animation: 'pulse 2s ease-in-out infinite' } : {}),
                  }}
                >
                  {cfg.icon}
                </button>

                {/* Number badge */}
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  padding: '1px 6px', borderRadius: 9999, flexShrink: 0,
                  background: subtask.status === 'completed' ? 'rgba(34,197,94,0.15)' :
                    subtask.status === 'in_progress' ? 'rgba(59,130,246,0.15)' :
                    subtask.status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.1)',
                  color: cfg.color,
                }}>
                  #{index + 1}
                </span>

                {/* Title */}
                {editingId === subtask.id ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onBlur={() => handleSaveTitle(subtask.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveTitle(subtask.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    style={{
                      flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500,
                      color: 'var(--text-primary)', background: 'var(--bg-elevated)',
                      border: '1px solid var(--accent)', borderRadius: 4,
                      padding: '2px 6px', outline: 'none',
                    }}
                  />
                ) : (
                  <span
                    onDoubleClick={e => { e.stopPropagation(); setEditingId(subtask.id); setEditTitle(subtask.title); }}
                    style={{
                      flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500,
                      color: subtask.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      cursor: 'text',
                    }}
                  >
                    {subtask.title}
                  </span>
                )}

                {/* Delete on hover */}
                {hoveredId === subtask.id && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(subtask.id); }}
                    title="Remove subtask"
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--text-muted)', cursor: 'pointer',
                      fontSize: 12, lineHeight: 1, padding: '2px 4px', borderRadius: 4, flexShrink: 0,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                  >
                    ✕
                  </button>
                )}

                {/* Expand chevron */}
                {hasDetails && (
                  <span style={{
                    fontSize: 11, color: 'var(--text-muted)', flexShrink: 0,
                    transition: 'transform 0.2s',
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    display: 'inline-block',
                  }}>
                    ▶
                  </span>
                )}
              </div>

              {/* Expanded details */}
              {isExpanded && hasDetails && (
                <div style={{
                  padding: '0 12px 10px 46px',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                }}>
                  {subtask.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {subtask.description}
                    </div>
                  )}
                  {subtask.files.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                      {subtask.files.map(f => (
                        <code key={f} style={{
                          fontSize: 10, padding: '2px 6px',
                          background: 'rgba(100,116,139,0.1)', borderRadius: 4,
                          color: 'var(--text-muted)', border: '1px solid var(--border-subtle)',
                        }}>
                          {f.split('/').pop()}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add subtask form */}
      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onFocus={() => setShowDescription(true)}
          placeholder="Add a subtask..."
          style={{
            fontSize: 12, color: 'var(--text-primary)', background: 'transparent',
            border: '1px dashed var(--border-subtle)', borderRadius: 10,
            padding: '10px 12px', outline: 'none', transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
          onMouseLeave={e => { if (document.activeElement !== e.currentTarget) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}
        />
        {showDescription && newTitle.trim() && (
          <>
            <textarea
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              style={{
                fontSize: 11, color: 'var(--text-secondary)', background: 'transparent',
                border: '1px solid var(--border-subtle)', borderRadius: 8,
                padding: '6px 10px', outline: 'none', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" disabled={submitting || !newTitle.trim()} style={{
                fontSize: 11, fontWeight: 500, padding: '5px 14px', borderRadius: 6,
                border: 'none', background: 'var(--accent)', color: '#fff',
                cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.5 : 1,
              }}>
                {submitting ? 'Adding...' : 'Add'}
              </button>
              <button type="button" onClick={() => { setShowDescription(false); setNewTitle(''); setNewDescription(''); }} style={{
                fontSize: 11, padding: '5px 14px', borderRadius: 6,
                border: '1px solid var(--border-subtle)', background: 'transparent',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
