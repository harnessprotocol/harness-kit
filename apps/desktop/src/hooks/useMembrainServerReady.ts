// apps/desktop/src/hooks/useMembrainServerReady.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { MEMBRAIN_API } from '../lib/membrain-api';
import {
  membrainCheckInstalled,
  membrainStart,
  membrainStop,
} from '../lib/tauri';
import { nextBackoffMs, resetBackoffMs } from '../lib/backoff';
import { useServiceHealth } from '../contexts/ServiceHealthContext';

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

export interface MembrainServerReadyState {
  ready: boolean;
  timedOut: boolean;
  installed: boolean | null;
  starting: boolean;
  error: string | null;
  retry: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useMembrainServerReady(): MembrainServerReadyState {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAutoStarted = useRef(false);
  const intervalRef = useRef<number>(0);
  const { report } = useServiceHealth();

  useEffect(() => {
    membrainCheckInstalled()
      .then(setInstalled)
      .catch(() => setInstalled(null));
  }, []);

  useEffect(() => {
    if (ready || timedOut) return;

    let mounted = true;
    let backoffMs = resetBackoffMs();
    let totalWaitMs = 0;
    const DOWN_THRESHOLD_MS = 60_000;
    const HEARTBEAT_MS = 30_000;

    function scheduleNext(delay: number) {
      clearTimeout(intervalRef.current);
      intervalRef.current = window.setTimeout(tick, delay);
    }

    function tick() {
      fetchWithTimeout(`${MEMBRAIN_API}/graph/stats`, 1500)
        .then((res) => {
          if (!mounted) return;
          if (res.ok) {
            setReady(true);
            setTimedOut(false);
            setStarting(false);
            setError(null);
            report("membrain", "up");
          } else {
            onFailure();
          }
        })
        .catch(() => {
          if (!mounted) return;
          if (!hasAutoStarted.current && installed === true) {
            hasAutoStarted.current = true;
            membrainStart().catch(() => {});
          }
          onFailure();
        });
    }

    function onFailure() {
      totalWaitMs += backoffMs;
      if (totalWaitMs >= DOWN_THRESHOLD_MS && !timedOut) {
        setTimedOut(true);
        report("membrain", "down");
        scheduleNext(HEARTBEAT_MS);
        return;
      }
      backoffMs = nextBackoffMs(backoffMs);
      scheduleNext(backoffMs);
    }

    report("membrain", "starting");
    tick();

    return () => {
      mounted = false;
      clearTimeout(intervalRef.current);
    };
  }, [ready, timedOut, installed, report]);

  const retry = useCallback(() => {
    hasAutoStarted.current = false;
    setTimedOut(false);
    setReady(false);
    setStarting(false);
    setError(null);
  }, []);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      await membrainStart();
      retry();
    } catch (e) {
      setError(String(e));
      setStarting(false);
    }
  }, [retry]);

  const stop = useCallback(async () => {
    try {
      await membrainStop();
      setReady(false);
      setTimedOut(false);
      report("membrain", "down");
    } catch (e) {
      setError(String(e));
    }
  }, [report]);

  return { ready, timedOut, installed, starting, error, retry, start, stop };
}
