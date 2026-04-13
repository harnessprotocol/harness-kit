import { useCallback, useEffect, useRef, useState } from "react";
import { BOARD_SERVER_BASE } from "../lib/board-api";
import {
  boardServerCheckInstalled,
  boardServerInstall,
  boardServerRestart,
  boardServerStart,
} from "../lib/tauri";

const MAX_POLLS = 5;

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

export interface BoardServerReadyState {
  ready: boolean;
  timedOut: boolean;
  installed: boolean | null;
  starting: boolean;
  error: string | null;
  retry: () => void;
  install: () => Promise<void>;
  start: () => Promise<void>;
  restart: () => Promise<void>;
}

export function useBoardServerReady(): BoardServerReadyState {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollCount = useRef(0);

  // Check if plist is installed on mount
  useEffect(() => {
    boardServerCheckInstalled()
      .then(setInstalled)
      .catch(() => setInstalled(null));
  }, []);

  useEffect(() => {
    if (ready || timedOut) return;

    let mounted = true;
    const check = () => {
      fetchWithTimeout(`${BOARD_SERVER_BASE}/health`, 1500)
        .then((res) => {
          if (!mounted) return;
          if (res.ok) {
            setReady(true);
            setStarting(false);
            setError(null);
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
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [ready, timedOut]);

  const retry = useCallback(() => {
    pollCount.current = 0;
    setTimedOut(false);
    setReady(false);
    setStarting(false);
    setError(null);
  }, []);

  const install = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      await boardServerInstall();
      setInstalled(true);
      retry();
    } catch (e) {
      setError(String(e));
      setStarting(false);
    }
  }, [retry]);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      await boardServerStart();
      retry();
    } catch (e) {
      setError(String(e));
      setStarting(false);
    }
  }, [retry]);

  const restart = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      await boardServerRestart();
      retry();
    } catch (e) {
      setError(String(e));
      setStarting(false);
    }
  }, [retry]);

  return { ready, timedOut, installed, starting, error, retry, install, start, restart };
}
