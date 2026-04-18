import { useState, useEffect, useRef, useCallback } from "react";
import { Channel } from "@tauri-apps/api/core";
import {
  aiCheckOllama,
  aiListModels,
  aiListRunningModels,
  aiShowModel,
  aiGetOllamaVersion,
  aiPullModel,
  type AIModelInfo,
  type RunningModel,
  type ModelDetails,
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
  runningModels: RunningModel[];
  modelDetails: Record<string, ModelDetails>;
  version: string | null;
  error: string | null;
  retry: () => void;
  listModels: () => Promise<void>;
  fetchModelDetails: (name: string) => Promise<ModelDetails | null>;
  pullModel: (model: string, onProgress: (p: DownloadProgress) => void) => Promise<void>;
}

export function useOllama(): OllamaState {
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [models, setModels] = useState<AIModelInfo[]>([]);
  const [runningModels, setRunningModels] = useState<RunningModel[]>([]);
  const [modelDetails, setModelDetails] = useState<Record<string, ModelDetails>>({});
  const [version, setVersion] = useState<string | null>(null);
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

          // Always poll running models (changes frequently as models load/unload)
          aiListRunningModels()
            .then((m) => { if (mountedRef.current) setRunningModels(m); })
            .catch(() => {}); // non-fatal — older Ollama versions may not support /api/ps

          // Leading edge: only refresh model list + version when Ollama just came up
          if (!wasRunning) {
            setError(null);
            aiListModels()
              .then((m) => { if (mountedRef.current) setModels(m); })
              .catch((e) => { if (mountedRef.current) { logAIError("listModels", e); setError(String(e)); } });
            aiGetOllamaVersion()
              .then((v) => { if (mountedRef.current) setVersion(v); })
              .catch(() => {}); // non-fatal
          }
        } else {
          prevRunningRef.current = false;
          setRunning(false);
          setChecking(true);
          setRunningModels([]);

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
        setRunningModels([]);
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

  const fetchModelDetails = useCallback(async (name: string): Promise<ModelDetails | null> => {
    // Return cached entry if already fetched
    if (modelDetails[name]) return modelDetails[name];
    try {
      const details = await aiShowModel(name);
      if (mountedRef.current) {
        setModelDetails((prev) => ({ ...prev, [name]: details }));
      }
      return details;
    } catch (e) {
      logAIError("showModel", e);
      return null;
    }
  }, [modelDetails]);

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

  return {
    running,
    checking,
    timedOut,
    models,
    runningModels,
    modelDetails,
    version,
    error,
    retry,
    listModels,
    fetchModelDetails,
    pullModel,
  };
}
