import type { MembrainServerReadyState } from '../../hooks/useMembrainServerReady';

interface Props {
  serverState: MembrainServerReadyState;
}

export function MembrainOffline({ serverState }: Props) {
  const { installed, starting, error, start } = serverState;

  const buttonStyle = {
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600 as const,
    borderRadius: 6,
    border: 'none',
    cursor: starting ? 'not-allowed' : 'pointer',
    background: 'var(--accent)',
    color: '#fff',
    opacity: starting ? 0.6 : 1,
    transition: 'opacity 0.15s',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <span style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600 }}>
        membrain server is not running
      </span>

      {installed === false ? (
        <>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 380 }}>
            Install membrain to get started:
          </span>
          <code style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 13,
            color: 'var(--text-secondary)',
            fontFamily: 'monospace',
          }}>
            go install github.com/siracusa5/membrain/cmd/mem@latest
          </code>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Then click Start below to launch the server.
          </span>
          <button style={buttonStyle} disabled={starting} onClick={start}>
            {starting ? 'Starting...' : 'Start membrain'}
          </button>
        </>
      ) : (
        <>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            membrain is installed but not responding on port 3131.
          </span>
          <button style={buttonStyle} disabled={starting} onClick={start}>
            {starting ? 'Starting...' : 'Start Server'}
          </button>
        </>
      )}

      {error && (
        <div style={{
          marginTop: 8,
          padding: '8px 14px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--text-secondary)',
          maxWidth: 420,
          textAlign: 'center',
          lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
