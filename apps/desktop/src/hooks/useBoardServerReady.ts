import { useState, useEffect, useRef } from 'react';
import { BOARD_SERVER_BASE } from '../lib/board-api';

const MAX_POLLS = 5;

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function useBoardServerReady(): { ready: boolean; timedOut: boolean } {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const pollCount = useRef(0);

  useEffect(() => {
    if (ready || timedOut) return;

    let mounted = true;
    const check = () => {
      fetchWithTimeout(`${BOARD_SERVER_BASE}/health`, 1500)
        .then(res => {
          if (!mounted) return;
          if (res.ok) {
            setReady(true);
          } else {
            pollCount.current += 1;
            if (pollCount.current >= MAX_POLLS) setTimedOut(true);
          }
        })
        .catch(() => {
          if (!mounted) return;
          pollCount.current += 1;
          if (pollCount.current >= MAX_POLLS) setTimedOut(true);
        });
    };

    check();
    const id = setInterval(check, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, [ready, timedOut]);

  return { ready, timedOut };
}
