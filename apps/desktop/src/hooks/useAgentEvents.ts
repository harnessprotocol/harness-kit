// apps/desktop/src/hooks/useAgentEvents.ts
import { useState, useEffect } from 'react';
import { agentApi } from '../lib/agent-api';
import type { AgentEvent } from '../lib/agent-api';

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
    setIsRunning(true);
    const unsub = agentApi.subscribe(taskId, (event) => {
      setEvents(prev => [...prev, event]);
      if (event.type === 'agent_phase') {
        setPhase(event.phase);
        setProgress(event.progress);
      }
      if (event.type === 'agent_done' || event.type === 'agent_error') {
        setIsRunning(false);
      }
    });
    return unsub;
  }, [taskId]);

  return { events, phase, progress, isRunning };
}
