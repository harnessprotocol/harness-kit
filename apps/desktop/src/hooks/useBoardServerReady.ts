import { useState, useEffect } from 'react';
import { BOARD_SERVER_BASE } from '../lib/board-api';

export function useBoardServerReady(): { ready: boolean } {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;

    const check = () => {
      fetch(`${BOARD_SERVER_BASE}/health`, { signal: AbortSignal.timeout(1500) })
        .then(res => { if (res.ok) setReady(true); })
        .catch(() => { /* not yet ready */ });
    };

    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, [ready]);

  return { ready };
}
