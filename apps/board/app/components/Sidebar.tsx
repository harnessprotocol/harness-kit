'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Sun, Moon, PanelLeftClose, PanelLeft, Plus, LayoutGrid, TableProperties } from 'lucide-react';
import type { Project } from '../lib/api';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { toggleTheme, getTheme } from '../lib/theme';

const PROJECT_COLORS = [
  '#7c3aed', '#2563eb', '#16a34a', '#d97706',
  '#dc2626', '#db2777', '#0891b2', '#65a30d',
];

const STORAGE_KEY = 'harness:board:sidebar';

function colorDot(color?: string) {
  return color ?? '#55556a';
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState(PROJECT_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Read collapsed state and theme on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'collapsed') setCollapsed(true);
    } catch { /* ignore */ }
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  // Fetch projects
  useEffect(() => {
    api.projects.list()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-focus name input when form opens
  useEffect(() => {
    if (formOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [formOpen]);

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
    } catch { /* ignore */ }
    if (next) resetForm();
  }, [collapsed]);

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

  function handleThemeToggle() {
    toggleTheme();
    setIsDark(document.documentElement.classList.contains('dark'));
  }

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden transition-all duration-200',
        collapsed ? 'w-12 min-w-12' : 'w-[220px] min-w-[220px]',
      )}
    >
      {/* Header / Logo */}
      <div className={cn('border-b border-[var(--border-subtle)]', collapsed ? 'px-2 py-4' : 'px-4 py-4')}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-xs font-bold text-white">
              H
            </span>
            <button
              onClick={toggleCollapsed}
              className="flex items-center justify-center rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Expand sidebar"
            >
              <PanelLeft size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-xs font-bold text-white">
              H
            </span>
            <span className="flex-1 text-sm font-semibold text-[var(--text-primary)]">
              Harness Board
            </span>
            <button
              onClick={toggleCollapsed}
              className="flex items-center justify-center rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Projects section */}
      {collapsed ? (
        <nav className="flex flex-1 flex-col items-center gap-2 overflow-y-auto py-3">
          {projects.map(p => {
            const isActive = pathname === `/${p.slug}` || pathname.startsWith(`/${p.slug}/`);
            return (
              <Link
                key={p.slug}
                href={`/${p.slug}`}
                className="block"
                title={p.name}
              >
                <span
                  className={cn(
                    'block h-2 w-2 rounded-full',
                    isActive && 'outline outline-2 outline-offset-2 outline-[var(--accent)]',
                  )}
                  style={{ background: colorDot(p.color) }}
                />
              </Link>
            );
          })}
        </nav>
      ) : (
        <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
          {/* Section label */}
          <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Projects
          </div>

          {loading ? (
            <div className="px-2 text-xs text-[var(--text-muted)]">Loading…</div>
          ) : projects.length === 0 ? (
            <div className="px-2 text-xs text-[var(--text-muted)]">No projects yet</div>
          ) : (
            projects.map(p => {
              const isActive = pathname === `/${p.slug}` || pathname.startsWith(`/${p.slug}/`);
              return (
                <Link
                  key={p.slug}
                  href={`/${p.slug}`}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                    isActive
                      ? 'bg-[var(--accent-dim)] font-medium text-[var(--text-primary)] border-l-2 border-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: colorDot(p.color) }}
                  />
                  <span className="truncate">{p.name}</span>
                </Link>
              );
            })
          )}

          {/* Inline project creation */}
          {formOpen ? (
            <div className="mt-1 px-2">
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
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
              />

              {/* Color swatches */}
              <div className="flex flex-wrap gap-1.5 py-2">
                {PROJECT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormColor(c)}
                    className={cn(
                      'h-4 w-4 rounded-full border-none p-0 cursor-pointer',
                      formColor === c && 'outline outline-2 outline-offset-2 outline-[var(--text-primary)]',
                    )}
                    style={{ background: c }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>

              {/* Button row */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className={cn(
                    'rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white',
                    creating ? 'cursor-default opacity-60' : 'cursor-pointer hover:opacity-90',
                  )}
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={creating}
                  className="cursor-pointer border-none bg-transparent px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              </div>

              {formError && (
                <div className="mt-1.5 text-[11px] text-red-500">{formError}</div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border)] bg-transparent px-2 py-1.5 text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors"
            >
              + New Project
            </button>
          )}
        </nav>
      )}

      {/* Settings section — theme toggle */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 border-t border-[var(--border-subtle)] py-3">
          <button
            onClick={handleThemeToggle}
            className="flex items-center justify-center rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      ) : (
        <div className="border-t border-[var(--border-subtle)] px-4 py-3">
          {/* Theme toggle row */}
          <button
            onClick={handleThemeToggle}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer bg-transparent border-none"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
            <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          {/* New Task button */}
          <button
            type="button"
            onClick={() => {
              // Dispatch a custom event that the board page listens to
              window.dispatchEvent(new CustomEvent('harness:new-task'));
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white cursor-pointer hover:opacity-90 transition-opacity"
          >
            <Plus size={14} />
            New Task
          </button>
        </div>
      )}
    </aside>
  );
}
