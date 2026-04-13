import { Channel } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AIModelInfo,
  aiCheckOllama,
  aiListModels,
  aiPullModel,
  type DownloadProgress,
} from "../lib/tauri";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15; // 30 seconds before timing out

export interface OllamaState {
  running: boolean;
  checking: boolean;
  timedOut: boolean;
  models: AIModelInfo[];
  error: string | null;
  retry: () => void;
  listModels: () => Promise<void>;
  pullModel: (model: string, onProgress: (p: DownloadProgress) => void) => Promise<void>;
}

export function useOllama(): OllamaState {
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [models, setModels] = useState<AIModelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollCount = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (running || timedOut) return;

    let alive = true;

    const check = async () => {
      try {
        const status = await aiCheckOllama();
        if (!alive || !mountedRef.current) return;

        if (status.running) {
          setRunning(true);
          setChecking(false);
          setError(null);
          // Eagerly load model list once connected
          aiListModels()
            .then((m) => {
              if (mountedRef.current) setModels(m);
            })
            .catch(() => {});
        } else {
          pollCount.current += 1;
          if (pollCount.current >= MAX_POLLS) {
            setTimedOut(true);
            setChecking(false);
          }
        }
      } catch {
        if (!alive || !mountedRef.current) return;
        pollCount.current += 1;
        if (pollCount.current >= MAX_POLLS) {
          setTimedOut(true);
          setChecking(false);
        }
      }
    };

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [running, timedOut]);

  const retry = useCallback(() => {
    pollCount.current = 0;
    setRunning(false);
    setChecking(true);
    setTimedOut(false);
    setError(null);
  }, []);

  const listModels = useCallback(async () => {
    try {
      const m = await aiListModels();
      if (mountedRef.current) setModels(m);
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    }
  }, []);

  const pullModel = useCallback(
    async (model: string, onProgress: (p: DownloadProgress) => void): Promise<void> => {
      const channel = new Channel<DownloadProgress>();
      channel.onmessage = (progress) => {
        onProgress(progress);
      };

      await aiPullModel(model, channel);

      // Refresh model list after download completes
      if (mountedRef.current) {
        await listModels();
      }
    },
    [listModels],
  );

  return { running, checking, timedOut, models, error, retry, listModels, pullModel };
}
