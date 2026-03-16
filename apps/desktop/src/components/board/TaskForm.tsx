import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import type { Epic, TaskStatus } from '../../lib/board-api';
import { api } from '../../lib/board-api';

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setEpicId(defaultEpicId ?? epics[0]?.id ?? 0);
      setError('');
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open, defaultEpicId, epics]);

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
      });
      // If a specific status was requested (e.g. created from In Progress column), move it
      if (defaultStatus && defaultStatus !== 'backlog') {
        await api.tasks.update(projectSlug, task.id, { status: defaultStatus });
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 14,
    padding: '8px 12px',
    fontFamily: 'inherit',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="board-scope">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 480,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              zIndex: 70,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              New task
            </h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Epic selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Epic</label>
                <select
                  value={epicId}
                  onChange={e => setEpicId(Number(e.target.value))}
                  style={{ ...inputStyle, appearance: 'none' }}
                >
                  {epics.map(ep => (
                    <option key={ep.id} value={ep.id}>{ep.name}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Title</label>
                <input
                  ref={titleRef}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  style={inputStyle}
                  onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; }}
                  onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; }}
                />
              </div>

              {/* Description */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                  Description <span style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Add context, acceptance criteria, links..."
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; }}
                  onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; }}
                />
              </div>

              {error && (
                <div style={{ fontSize: 12, color: 'var(--blocked)', background: 'rgba(220,38,38,0.08)', borderRadius: 6, padding: '6px 10px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '7px 16px', background: 'transparent',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '7px 20px', background: 'var(--accent)',
                    border: 'none', borderRadius: 6,
                    color: '#fff', fontSize: 13, fontWeight: 500,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  {submitting ? 'Creating...' : 'Create task'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
