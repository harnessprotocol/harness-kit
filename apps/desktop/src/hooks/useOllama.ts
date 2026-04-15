import { useState, useEffect, useRef, useCallback } from "react";
import { Channel } from "@tauri-apps/api/core";
import {
  aiCheckOllama,
  aiListModels,
  aiPullModel,
  type AIModelInfo,
  type DownloadProgress,
} from "../lib/tauri";
import { logAIError } from "./ai/logging";

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
  // Track previous running state to detect false→true and true→false transitions
  const prevRunningRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const status = await aiCheckOllama();
        if (!alive || !mountedRef.current) return;

        const wasRunning = prevRunningRef.current;

        if (status.running) {
          prevRunningRef.current = true;
          setRunning(true);
          setChecking(false);
          setTimedOut(false);
          pollCount.current = 0;

          // Leading edge: only refresh models when Ollama just came up
          if (!wasRunning) {
            setError(null);
            aiListModels()
              .then((m) => { if (mountedRef.current) setModels(m); })
              .catch((e) => { if (mountedRef.current) { logAIError("listModels", e); setError(String(e)); } });
          }
        } else {
          prevRunningRef.current = false;
          setRunning(false);
          setChecking(true);

          // Transition: Ollama was running, now it's not
          if (wasRunning) {
            setError("Ollama connection lost");
          }

          pollCount.current += 1;
          if (pollCount.current >= MAX_POLLS) {
            setTimedOut(true);
            setChecking(false);
          }
        }
      } catch (e) {
        if (!alive || !mountedRef.current) return;
        prevRunningRef.current = false;
        setRunning(false);
        pollCount.current += 1;
        if (pollCount.current >= MAX_POLLS) {
          setTimedOut(true);
          setChecking(false);
        }
        logAIError("health-check", e);
      }
    };

    // Run immediately, then on interval — unconditionally for the hook lifetime
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []); // Empty deps — interval never restarts based on state

  const retry = useCallback(() => {
    // Reset counters/state; the always-running interval will pick up the next tick
    pollCount.current = 0;
    prevRunningRef.current = false;
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
      if (mountedRef.current) {
        logAIError("listModels", e);
        setError(String(e));
      }
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
