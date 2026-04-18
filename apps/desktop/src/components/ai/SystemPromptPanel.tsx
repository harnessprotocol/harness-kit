import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { aiUpdateSessionPrompt } from '../../lib/tauri';
import {
  buildSystemPrompt,
  type ContextSourceKey,
} from '../../hooks/ai/contextSources';
import { SYSTEM_PROMPT } from '../../hooks/ai/toolRegistry';

interface Props {
  sessionId: string | null;
  onPromptChange: (prompt: string) => void;
}

const ALL_SOURCES: ContextSourceKey[] = [
  'harness.yaml',
  'board',
  'route',
  'recent-sessions',
  'claude.md',
];

const SOURCE_LABELS: Record<ContextSourceKey, string> = {
  'harness.yaml': 'harness.yaml',
  'board': 'board',
  'route': 'route',
  'recent-sessions': 'sessions',
  'claude.md': 'CLAUDE.md',
};

const DEFAULT_SOURCES = new Set<ContextSourceKey>(['harness.yaml', 'route']);

export function SystemPromptPanel({ sessionId, onPromptChange }: Props) {
  const location = useLocation();
  const [open, setOpen] = useState(true);
  const [locked, setLocked] = useState(false);
  const [enabled, setEnabled] = useState<Set<ContextSourceKey>>(DEFAULT_SOURCES);
  const [text, setText] = useState(SYSTEM_PROMPT);
  const [loading, setLoading] = useState(false);

  const regenerate = useCallback(async (sources: Set<ContextSourceKey>, base: string) => {
    if (sources.size === 0) {
      onPromptChange(base);
      setText(base);
      return;
    }
    setLoading(true);
    try {
      const ctx = await buildSystemPrompt(sources, location.pathname);
      const full = ctx ? `${base}\n\n${ctx}` : base;
      setText(full);
      onPromptChange(full);
    } finally {
      setLoading(false);
    }
  }, [location.pathname, onPromptChange]);

  // Auto-populate on mount and when chips change (unless locked)
  useEffect(() => {
    if (!locked) {
      regenerate(enabled, SYSTEM_PROMPT);
    }
  }, [enabled, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async (prompt: string, sources: Set<ContextSourceKey>) => {
    if (!sessionId) return;
    await aiUpdateSessionPrompt(
      sessionId,
      prompt,
      JSON.stringify([...sources]),
    ).catch(() => {});
  }, [sessionId]);

  const handleToggleSource = (key: ContextSourceKey) => {
    if (locked) return;
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    onPromptChange(e.target.value);
  };

  const handleTextBlur = () => {
    persist(text, enabled);
  };

  const handleLock = () => {
    setLocked((l) => {
      const next = !l;
      if (!next) regenerate(enabled, SYSTEM_PROMPT);
      return next;
    });
  };

  const handleReset = () => {
    setLocked(false);
    setEnabled(DEFAULT_SOURCES);
    regenerate(DEFAULT_SOURCES, SYSTEM_PROMPT);
  };

  const handleClear = () => {
    setLocked(true);
    setText('');
    onPromptChange('');
    persist('', enabled);
  };

  const monoStyle: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  };

  const chipBase: React.CSSProperties = {
    ...monoStyle,
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 4,
    border: '1px solid var(--border)',
    cursor: locked ? 'default' : 'pointer',
    transition: 'background 0.1s',
    userSelect: 'none',
  };

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 14px',
          cursor: 'pointer',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          style={{
            ...monoStyle,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--fg-muted)',
            flex: 1,
          }}
        >
          System Prompt
          {locked && (
            <span style={{ marginLeft: 6, color: 'var(--accent)', fontSize: 9 }}>LOCKED</span>
          )}
        </span>
        <span style={{ fontSize: 9, color: 'var(--fg-subtle)' }}>{open ? '▾' : '▸'}</span>
      </div>

      {open && (
        <div style={{ padding: '0 14px 10px' }}>
          {/* Source chips */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
            {ALL_SOURCES.map((key) => {
              const active = enabled.has(key);
              return (
                <button
                  key={key}
                  style={{
                    ...chipBase,
                    background: active ? 'var(--accent-subtle)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--fg-subtle)',
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    opacity: locked ? 0.5 : 1,
                  }}
                  onClick={(e) => { e.stopPropagation(); handleToggleSource(key); }}
                  title={active ? `Remove ${key} from context` : `Add ${key} to context`}
                >
                  {SOURCE_LABELS[key]}
                </button>
              );
            })}
            {loading && (
              <span style={{ ...monoStyle, fontSize: 10, color: 'var(--fg-subtle)', alignSelf: 'center' }}>
                loading…
              </span>
            )}
          </div>

          {/* Prompt textarea */}
          <textarea
            value={text}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            rows={5}
            style={{
              ...monoStyle,
              width: '100%',
              fontSize: 11,
              background: 'var(--bg-base)',
              color: 'var(--fg)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '6px 8px',
              resize: 'vertical',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={handleLock}
              style={{
                ...monoStyle,
                fontSize: 10,
                padding: '2px 8px',
                background: locked ? 'var(--accent-subtle)' : 'transparent',
                color: locked ? 'var(--accent)' : 'var(--fg-muted)',
                border: `1px solid ${locked ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {locked ? 'unlock' : 'lock'}
            </button>
            <button
              onClick={handleReset}
              style={{
                ...monoStyle,
                fontSize: 10,
                padding: '2px 8px',
                background: 'transparent',
                color: 'var(--fg-muted)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              reset
            </button>
            <button
              onClick={handleClear}
              style={{
                ...monoStyle,
                fontSize: 10,
                padding: '2px 8px',
                background: 'transparent',
                color: 'var(--fg-muted)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
