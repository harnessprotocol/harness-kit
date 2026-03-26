import { useLocation } from 'react-router-dom';
import { useMembrainServerReady } from '../../hooks/useMembrainServerReady';
import { MembrainOffline } from '../../components/memory/MembrainOffline';
import { MEMBRAIN_SERVER_BASE } from '../../lib/membrain-api';

export default function MemoryWebView() {
  const location = useLocation();
  const serverState = useMembrainServerReady();
  const { ready, timedOut } = serverState;

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
