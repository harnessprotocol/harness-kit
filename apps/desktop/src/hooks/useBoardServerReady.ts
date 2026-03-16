import { useState, useEffect } from 'react';
import { BOARD_SERVER_BASE } from '../lib/board-api';

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function useBoardServerReady(): { ready: boolean } {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Once ready, stop polling. The effect re-runs when ready flips true,
    // which clears the interval via the cleanup return below.
    if (ready) return;

    const check = () => {
      fetchWithTimeout(`${BOARD_SERVER_BASE}/health`, 1500)
        .then(res => { if (res.ok) setReady(true); })
        .catch(() => { /* not yet ready — next poll will retry */ });
    };

    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, [ready]);

  return { ready };
}
