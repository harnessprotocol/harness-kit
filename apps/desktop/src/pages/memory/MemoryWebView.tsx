import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMembrainServerReady } from '../../hooks/useMembrainServerReady';
import { MembrainOffline } from '../../components/memory/MembrainOffline';
import { MEMBRAIN_SERVER_BASE } from '../../lib/membrain-api';
import { getMembrainEnabled } from '../../lib/preferences';
import MemoryLabsPreview from './MemoryLabsPreview';

export default function MemoryWebView() {
  const location = useLocation();
  // Track enabled state locally so Enable button re-renders immediately
  const [enabled, setEnabled] = useState(getMembrainEnabled);

  const serverState = useMembrainServerReady();
  const { ready, timedOut } = serverState;

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

  // Strip /memory prefix to get the membrain SvelteKit path
  const path = location.pathname.replace(/^\/memory/, '') || '/';
  const src = `${MEMBRAIN_SERVER_BASE}${path}`;

  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <iframe
        key={src}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
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
