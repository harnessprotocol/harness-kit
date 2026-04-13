// apps/desktop/src/hooks/useAgentEvents.ts
import { useEffect, useState } from "react";
import type { AgentEvent } from "../lib/agent-api";
import { agentApi } from "../lib/agent-api";

export type { AgentEvent };

export interface AgentEventLog {
  events: AgentEvent[];
  phase: string | null;
  progress: number;
  isRunning: boolean;
}

export function useAgentEvents(taskId: number | null): AgentEventLog {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    agentApi
      .subscribe(taskId, (event) => {
        setEvents((prev) => [...prev, event]);
        if (event.type === "agent_phase") {
          setPhase(event.phase);
          setProgress(event.progress);
          setIsRunning(true);
        }
        if (event.type === "agent_done" || event.type === "agent_error") {
          setIsRunning(false);
        }
      })
      .then((unsub) => {
        if (cancelled) {
          unsub();
          return;
        }
        cleanup = unsub;
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [taskId]);

  return { events, phase, progress, isRunning };
}
