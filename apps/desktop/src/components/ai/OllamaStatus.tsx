import { useState, useEffect, useRef } from 'react';
import type { OllamaState } from '../../hooks/useOllama';

interface Props {
  ollama: Pick<OllamaState, 'running' | 'checking' | 'timedOut' | 'retry' | 'models'>;
  baseUrl?: string;
  isStreaming?: boolean;
  onCancelStream?: () => void;
}

const DOT_SIZE = 7;

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        animation: pulse ? 'comparator-pulse 1.5s ease-in-out infinite' : undefined,
      }}
    />
  );
}

function Popover({
  running,
  checking,
  models,
  baseUrl,
  isStreaming,
  onRetry,
  onCancelStream,
  onClose,
}: {
  running: boolean;
  checking: boolean;
  models: OllamaState['models'];
  baseUrl: string;
  isStreaming?: boolean;
  onRetry: () => void;
  onCancelStream?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [onClose]);

  const btnStyle: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 11,
    color: 'var(--fg-muted)',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  };

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 6,
        width: 240,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 10,
        zIndex: 200,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <Dot
          color={running ? 'var(--success, #22c55e)' : checking ? 'var(--fg-subtle)' : 'var(--danger, #ef4444)'}
          pulse={checking && !running}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-base)' }}>
          {running ? 'Ollama running' : checking ? 'Connecting…' : 'Ollama offline'}
        </span>
      </div>

      {/* Base URL */}
      <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {baseUrl}
      </div>

      {/* Model count */}
      <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
        {running ? `${models.length} model${models.length !== 1 ? 's' : ''} loaded` : '—'}
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

      {/* Actions */}
      <button
        style={btnStyle}
        onClick={() => { onRetry(); onClose(); }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--fg-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
      >
        {running ? 'Force recheck' : 'Retry connection'}
      </button>

      {isStreaming && onCancelStream && (
        <button
          style={{ ...btnStyle, borderColor: 'var(--danger, #ef4444)', color: 'var(--danger, #ef4444)' }}
          onClick={() => { onCancelStream(); onClose(); }}
        >
          Cancel stream
        </button>
      )}
    </div>
  );
}

export function OllamaStatus({ ollama, baseUrl = 'http://localhost:11434', isStreaming, onCancelStream }: Props) {
  const { running, checking, timedOut, retry, models } = ollama;
  const [open, setOpen] = useState(false);

  const dotColor = running
    ? 'var(--success, #22c55e)'
    : checking && !timedOut
    ? 'var(--fg-subtle)'
    : 'var(--danger, #ef4444)';

  const label = running ? 'Ollama' : checking && !timedOut ? 'Connecting…' : 'Offline';

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Ollama status — click for details"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: 4,
        }}
      >
        <Dot color={dotColor} pulse={checking && !running && !timedOut} />
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{label}</span>
        {!running && !checking && (
          <span
            style={{
              fontSize: 9,
              color: 'var(--accent)',
              marginLeft: 2,
              textDecoration: 'underline',
              textDecorationStyle: 'dotted',
            }}
          >
            retry
          </span>
        )}
      </button>

      {open && (
        <Popover
          running={running}
          checking={checking}
          models={models}
          baseUrl={baseUrl}
          isStreaming={isStreaming}
          onRetry={retry}
          onCancelStream={onCancelStream}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
