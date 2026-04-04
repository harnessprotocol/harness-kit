import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import type { Competitor, CompetitorRelevance } from '../../lib/roadmap-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (competitor: Omit<Competitor, 'id'>) => void;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--fg-base)',
  fontSize: 13,
  padding: '8px 10px',
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600,
  color: 'var(--fg-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const pillBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  borderRadius: 9999, border: '1px solid var(--border-subtle)',
  padding: '4px 10px', fontSize: 11, fontWeight: 500,
  cursor: 'pointer', background: 'var(--bg-elevated)',
  color: 'var(--fg-muted)', transition: 'all 0.12s',
};

const RELEVANCE_OPTIONS: { value: CompetitorRelevance; label: string; color: string; bg: string; border: string }[] = [
  { value: 'high',   label: 'High',   color: '#16a34a', bg: 'rgba(22,163,74,0.12)',   border: 'rgba(22,163,74,0.3)' },
  { value: 'medium', label: 'Medium', color: '#d97706', bg: 'rgba(217,119,6,0.12)',   border: 'rgba(217,119,6,0.3)' },
  { value: 'low',    label: 'Low',    color: '#9a9892', bg: 'rgba(154,152,146,0.12)', border: 'rgba(154,152,146,0.3)' },
];

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function isValidUrl(url: string): boolean {
  try { new URL(url); return true; } catch { return false; }
}

export function AddCompetitorDialog({ open, onOpenChange, onAdd }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [relevance, setRelevance] = useState<CompetitorRelevance>('medium');
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setUrl('');
      setDescription('');
      setRelevance('medium');
      setError('');
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!url.trim()) { setError('URL is required'); return; }
    const normalized = normalizeUrl(url);
    if (!isValidUrl(normalized)) { setError('Enter a valid URL'); return; }
    onAdd({
      name: name.trim(),
      url: normalized,
      description: description.trim(),
      relevance,
      painPoints: [],
      strengths: [],
      marketPosition: '',
      source: 'manual',
    });
    onOpenChange(false);
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="board-scope">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => onOpenChange(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 }}
          />
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 460, maxWidth: 'calc(100vw - 32px)',
              maxHeight: '90vh',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: 'var(--shadow-popover)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 51,
            }}
          >
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-base)' }}>
                Add Competitor
              </span>
              <button
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 16,
                }}
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>
                  Name <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Competitor name"
                  style={inputStyle}
                  onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; }}
                  onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>
                  URL <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="competitor.com"
                  style={inputStyle}
                  onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; }}
                  onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>
                  Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--fg-muted)' }}>(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of this competitor"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; }}
                  onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Relevance</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {RELEVANCE_OPTIONS.map(opt => {
                    const isActive = relevance === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRelevance(opt.value)}
                        style={{
                          ...pillBase,
                          border: isActive ? `1px solid ${opt.border}` : '1px solid var(--border-subtle)',
                          background: isActive ? opt.bg : 'var(--bg-elevated)',
                          color: isActive ? opt.color : 'var(--fg-muted)',
                          fontWeight: isActive ? 600 : 500,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div style={{
                  fontSize: 12, color: '#dc2626',
                  background: 'rgba(220,38,38,0.08)',
                  borderRadius: 6, padding: '6px 10px',
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  style={{
                    padding: '7px 16px', background: 'transparent',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '7px 20px', background: 'var(--accent)',
                    border: 'none', borderRadius: 6,
                    color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Add Competitor
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
