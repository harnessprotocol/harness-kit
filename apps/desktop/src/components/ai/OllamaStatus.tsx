import type { OllamaState } from '../../hooks/useOllama';

interface Props {
  ollama: Pick<OllamaState, 'running' | 'checking' | 'timedOut' | 'retry'>;
}

export function OllamaStatus({ ollama }: Props) {
  const { running, checking, timedOut, retry } = ollama;

  if (running) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--success, #22c55e)',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          Ollama
        </span>
      </div>
    );
  }

  if (checking && !timedOut) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--fg-subtle)',
            flexShrink: 0,
            opacity: 0.5,
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Connecting…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'var(--danger, #ef4444)',
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Ollama offline</span>
      <button
        onClick={retry}
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '1px 6px',
          fontSize: 10,
          color: 'var(--fg-muted)',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
      >
        Retry
      </button>
    </div>
  );
}
