// apps/desktop/src/hooks/useBoardServerReady.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { BOARD_SERVER_BASE } from '../lib/board-api';
import {
  boardServerCheckInstalled,
  boardServerInstall,
  boardServerStart,
  boardServerRestart,
} from '../lib/tauri';
import { nextBackoffMs, resetBackoffMs } from '../lib/backoff';
import { useServiceHealth } from '../contexts/ServiceHealthContext';

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
  const intervalRef = useRef<number>(0);
  const { report } = useServiceHealth();

  useEffect(() => {
    boardServerCheckInstalled()
      .then(setInstalled)
      .catch(() => setInstalled(null));
  }, []);

  useEffect(() => {
    if (ready || timedOut) return;

    let mounted = true;
    let backoffMs = resetBackoffMs();
    // After ~60s total wait, transition to "down" but keep a heartbeat
    let totalWaitMs = 0;
    const DOWN_THRESHOLD_MS = 60_000;
    const HEARTBEAT_MS = 30_000;

    function scheduleNext(delay: number) {
      clearTimeout(intervalRef.current);
      intervalRef.current = window.setTimeout(tick, delay);
    }

    function tick() {
      fetchWithTimeout(`${BOARD_SERVER_BASE}/health`, 1500)
        .then((res) => {
          if (!mounted) return;
          if (res.ok) {
            setReady(true);
            setTimedOut(false);
            setStarting(false);
            setError(null);
            report("board", "up");
          } else {
            onFailure();
          }
        })
        .catch(() => {
          if (!mounted) return;
          onFailure();
        });
    }

    function onFailure() {
      totalWaitMs += backoffMs;
      if (totalWaitMs >= DOWN_THRESHOLD_MS && !timedOut) {
        setTimedOut(true);
        report("board", "down");
        // Keep heartbeat — auto-recover when server comes back
        scheduleNext(HEARTBEAT_MS);
        return;
      }
      backoffMs = nextBackoffMs(backoffMs);
      scheduleNext(backoffMs);
    }

    report("board", "starting");
    tick();

    return () => {
      mounted = false;
      clearTimeout(intervalRef.current);
    };
  }, [ready, timedOut, report]);

  const retry = useCallback(() => {
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
