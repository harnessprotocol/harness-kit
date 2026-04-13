import { useCallback, useEffect, useRef, useState } from "react";
import { MEMBRAIN_API } from "../lib/membrain-api";
import { membrainCheckInstalled, membrainStart, membrainStop } from "../lib/tauri";

const MAX_POLLS = 10;

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
  const pollCount = useRef(0);
  const hasAutoStarted = useRef(false);

  // Check if mem binary is on PATH
  useEffect(() => {
    membrainCheckInstalled()
      .then(setInstalled)
      .catch(() => setInstalled(null));
  }, []);

  useEffect(() => {
    if (ready || timedOut) return;

    let mounted = true;
    const check = () => {
      fetchWithTimeout(`${MEMBRAIN_API}/graph/stats`, 1500)
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
          // Auto-start on first failure if mem is installed
          if (!hasAutoStarted.current && installed === true) {
            hasAutoStarted.current = true;
            membrainStart().catch(() => {});
          }
        });
    };

    check();
    const id = setInterval(check, 2000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [ready, timedOut, installed]);

  const retry = useCallback(() => {
    pollCount.current = 0;
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
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return { ready, timedOut, installed, starting, error, retry, start, stop };
}
