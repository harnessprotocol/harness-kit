'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../lib/api';
import { api } from '../lib/api';

const PROJECT_COLORS = [
  '#7c3aed', '#2563eb', '#16a34a', '#d97706',
  '#dc2626', '#db2777', '#0891b2', '#65a30d',
];

const STORAGE_KEY = 'harness:board:sidebar';

function colorDot(color?: string) {
  return color ?? '#55556a';
}

const chevronStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 14,
  padding: '4px 6px',
  borderRadius: 4,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 13,
  padding: '6px 10px',
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const,
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState(PROJECT_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Read collapsed state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'collapsed') setCollapsed(true);
    } catch { /* ignore */ }
  }, []);

  // Fetch projects
  useEffect(() => {
    api.projects.list()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Auto-focus name input when form opens
  useEffect(() => {
    if (formOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [formOpen]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
    } catch { /* ignore */ }
    // Close form when collapsing
    if (next) {
      resetForm();
    }
  }

  function resetForm() {
    setFormOpen(false);
    setFormName('');
    setFormColor(PROJECT_COLORS[0]);
    setCreating(false);
    setFormError('');
  }

  async function handleCreate() {
    const trimmed = formName.trim();
    if (!trimmed) {
      setFormError('Name is required');
      return;
    }
    setCreating(true);
    setFormError('');
    try {
      const newProject = await api.projects.create({ name: trimmed, color: formColor });
      setProjects(prev => [...prev, newProject]);
      resetForm();
      router.push(`/${newProject.slug}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create project');
      setCreating(false);
    }
  }

  const width = collapsed ? 48 : 220;

  return (
    <aside
      style={{
        width,
        minWidth: width,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 0',
        overflow: 'hidden',
        transition: 'width 0.2s ease, min-width 0.2s ease',
      }}
    >
      {/* Wordmark / Header */}
      <div style={{ padding: collapsed ? '0 8px 16px' : '0 16px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        {collapsed ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 24,
                height: 24,
                background: 'var(--accent)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              H
            </span>
            <button
              onClick={toggleCollapsed}
              style={chevronStyle}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              aria-label="Expand sidebar"
            >
              &raquo;
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 24,
                height: 24,
                background: 'var(--accent)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              H
            </span>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', flex: 1 }}>
              Harness Board
            </span>
            <button
              onClick={toggleCollapsed}
              style={chevronStyle}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              aria-label="Collapse sidebar"
            >
              &laquo;
            </button>
          </div>
        )}
      </div>

      {/* Nav */}
      {collapsed ? (
        /* Collapsed: vertical strip of project color dots */
        <nav style={{ padding: '12px 0', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {projects.map(p => {
            const isActive = pathname === `/${p.slug}` || pathname.startsWith(`/${p.slug}/`);
            return (
              <Link
                key={p.slug}
                href={`/${p.slug}`}
                style={{ display: 'block', textDecoration: 'none' }}
                title={p.name}
              >
                <span
                  style={{
                    display: 'block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: colorDot(p.color),
                    ...(isActive ? { outline: '2px solid var(--accent)', outlineOffset: 2 } : {}),
                  }}
                />
              </Link>
            );
          })}
        </nav>
      ) : (
        /* Expanded: full project list + create form */
        <nav style={{ padding: '12px 8px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '0 8px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Projects
          </div>

          {loading ? (
            <div style={{ padding: '8px', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
          ) : projects.length === 0 ? (
            <div style={{ padding: '8px', fontSize: 12, color: 'var(--text-muted)' }}>No projects yet</div>
          ) : (
            projects.map(p => {
              const isActive = pathname === `/${p.slug}` || pathname.startsWith(`/${p.slug}/`);
              return (
                <Link
                  key={p.slug}
                  href={`/${p.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    textDecoration: 'none',
                    background: isActive ? 'var(--accent-dim)' : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: colorDot(p.color),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                </Link>
              );
            })
          )}

          {/* Inline project creation */}
          {formOpen ? (
            <div style={{ padding: '8px', marginTop: 4 }}>
              <input
                ref={nameInputRef}
                type="text"
                placeholder="Project name"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') resetForm();
                }}
                disabled={creating}
                style={inputStyle}
              />

              {/* Color swatches */}
              <div style={{ display: 'flex', gap: 6, padding: '8px 0', flexWrap: 'wrap' }}>
                {PROJECT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormColor(c)}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: c,
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      ...(formColor === c
                        ? { outline: '2px solid var(--text-primary)', outlineOffset: 2 }
                        : {}),
                    }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>

              {/* Button row */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '5px 12px',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: creating ? 'default' : 'pointer',
                    opacity: creating ? 0.6 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={creating}
                  style={{
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: 'none',
                    padding: '5px 8px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
              </div>

              {formError && (
                <div style={{ color: '#ef4444', fontSize: 11, marginTop: 6 }}>{formError}</div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                width: '100%',
                padding: '6px 8px',
                marginTop: 4,
                background: 'transparent',
                border: '1px dashed var(--border)',
                borderRadius: 6,
                color: 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              + New
            </button>
          )}
        </nav>
      )}

      {/* Footer — only when expanded */}
      {!collapsed && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Connected to :4800
          </div>
        </div>
      )}
    </aside>
  );
}
