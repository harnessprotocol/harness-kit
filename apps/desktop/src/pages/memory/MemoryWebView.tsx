import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMembrainServerReady } from '../../hooks/useMembrainServerReady';
import { MembrainOffline } from '../../components/memory/MembrainOffline';
import { MEMBRAIN_SERVER_BASE, syncMembrainTheme, verifyMembrainServer } from '../../lib/membrain-api';
import { getMembrainEnabled } from '../../lib/preferences';
import MemoryLabsPreview from './MemoryLabsPreview';

type AttestationState =
  | { status: 'idle' | 'checking' | 'trusted' }
  | { status: 'blocked'; reason: string };

export default function MemoryWebView() {
  const location = useLocation();
  // Track enabled state locally so Enable button re-renders immediately
  const [enabled, setEnabled] = useState(getMembrainEnabled);
  const [attestation, setAttestation] = useState<AttestationState>({ status: 'idle' });
  const [verifyAttempt, setVerifyAttempt] = useState(0);

  const serverState = useMembrainServerReady();
  const { ready, timedOut } = serverState;

  useEffect(() => {
    if (!ready) {
      setAttestation({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    setAttestation({ status: 'checking' });
    verifyMembrainServer(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) {
          setAttestation({ status: 'trusted' });
          syncMembrainTheme();
        } else {
          setAttestation({ status: 'blocked', reason: result.reason ?? 'Could not verify membrain server.' });
        }
      });

    return () => controller.abort();
  }, [ready, verifyAttempt]);

  // Labs gate — show teaser until the user explicitly opts in
  if (!enabled) {
    return <MemoryLabsPreview onEnable={() => setEnabled(true)} />;
  }

  if (timedOut) {
    return <MembrainOffline serverState={serverState} />;
  }

  if (!ready) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--fg-subtle)',
        fontSize: 13,
      }}>
        Connecting to membrain...
      </div>
    );
  }

  if (attestation.status === 'idle' || attestation.status === 'checking') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--fg-subtle)',
        fontSize: 13,
      }}>
        Verifying membrain...
      </div>
    );
  }

  if (attestation.status === 'blocked') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        flexDirection: 'column',
        gap: 10,
        color: 'var(--fg-muted)',
        fontSize: 13,
        textAlign: 'center',
      }}>
        <span style={{ fontWeight: 600, color: 'var(--fg-base)' }}>
          Could not verify the membrain web app.
        </span>
        <span style={{ maxWidth: 420, color: 'var(--fg-subtle)', lineHeight: 1.5 }}>
          {attestation.reason}
        </span>
        <button
          onClick={() => setVerifyAttempt((n) => n + 1)}
          style={{
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            padding: '7px 14px',
          }}
        >
          Verify again
        </button>
      </div>
    );
  }

  // Strip /memory prefix to get the membrain SvelteKit path.
  // Validate against known routes to prevent path injection.
  const ALLOWED_PREFIXES = ['/', '/graph', '/explore', '/entities', '/knowledge', '/context', '/trace', '/settings'];
  const rawPath = location.pathname.replace(/^\/memory/, '') || '/';
  const path = ALLOWED_PREFIXES.some(p => rawPath === p || rawPath.startsWith(p + '/')) ? rawPath : '/';
  const src = `${MEMBRAIN_SERVER_BASE}${path}`;

  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      {/* Sandbox intentionally omitted: WKWebView rejects ES module imports inside
          sandboxed iframes. The iframe is mounted only after verifyMembrainServer
          attests the localhost membrain stats endpoint and web app identity. */}
      <iframe
        key={src}
        src={src}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        title="membrain"
      />
    </div>
  );
}
