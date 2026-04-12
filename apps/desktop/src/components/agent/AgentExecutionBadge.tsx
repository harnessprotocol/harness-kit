// apps/desktop/src/components/agent/AgentExecutionBadge.tsx
// Ported from docs/plans/agent-ui-mock.html — .mini-badge, .phase-dot, .phase-label,
// .mini-progress, .mini-progress-fill

import { useEffect, useState } from 'react';
import { agentApi } from '../../lib/agent-api';

type Phase = 'spec' | 'planning' | 'coding' | 'qa_review' | 'qa_fixing' | 'done';

const PHASE_COLORS: Record<Phase | string, string> = {
  spec: '#6B7FA0',
  planning: '#FBBF24',
  coding: '#4B9EFF',
  qa_review: '#34D399',
  qa_fixing: '#FB923C',
  done: '#34D399',
};

const PHASE_LABELS: Record<Phase | string, string> = {
  spec: 'Spec',
  planning: 'Planning',
  coding: 'Coding',
  qa_review: 'QA Review',
  qa_fixing: 'QA Fix',
  done: 'Done',
};

interface Props {
  phase: string;
  progress: number;
  /** Optional: when provided, subscribes to WS for live progress updates */
  taskId?: number;
}

export function AgentExecutionBadge({ phase: phaseProp, progress: progressProp, taskId }: Props) {
  const [livePhase, setLivePhase] = useState(phaseProp);
  const [liveProgress, setLiveProgress] = useState(progressProp);

  // Subscribe to WS for live progress if taskId is provided
  useEffect(() => {
    if (!taskId) return;
    setLivePhase(phaseProp);
    setLiveProgress(progressProp);
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    agentApi.subscribe(taskId, (event) => {
      if (event.type === 'agent_phase') {
        setLivePhase(event.phase);
        setLiveProgress(event.progress);
      }
    }).then(unsub => {
      if (cancelled) { unsub(); return; }
      cleanup = unsub;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [taskId, phaseProp, progressProp]);

  const color = PHASE_COLORS[livePhase] ?? '#6B7FA0';
  const label = PHASE_LABELS[livePhase] ?? livePhase;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      {/* Phase dot + label row — .mini-badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* .phase-dot.anim */}
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: color,
          boxShadow: `0 0 6px ${color}`,
          animation: 'agent-pulse 1.6s ease-in-out infinite',
        }} />
        {/* .phase-label */}
        <span style={{
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
          letterSpacing: '.04em',
          color,
        }}>
          {label}
        </span>
      </div>
      {/* .mini-progress */}
      <div style={{
        height: 3,
        background: '#1F2D44',
        borderRadius: 2,
        overflow: 'visible',
        position: 'relative',
      }}>
        {/* .mini-progress-fill */}
        <div style={{
          height: '100%',
          borderRadius: 2,
          width: `${Math.min(100, Math.max(0, liveProgress))}%`,
          background: color,
          boxShadow: `0 0 8px ${color}60`,
          transition: 'width .4s ease',
        }} />
      </div>
    </div>
  );
}
