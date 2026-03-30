import { Check, Loader2, Circle, X } from 'lucide-react';
import { cn } from '../lib/utils';

type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface PhaseTimelineItem {
  name: string;
  label: string;
  status: PhaseStatus;
  model?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

interface Props {
  phases: PhaseTimelineItem[];
  className?: string;
}

function duration(start?: string, end?: string): string | undefined {
  if (!start || !end) return undefined;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

const STATUS_ICON: Record<PhaseStatus, React.ReactNode> = {
  completed: <Check size={10} strokeWidth={3} />,
  running:   <Loader2 size={10} className="animate-spin" />,
  failed:    <X size={10} strokeWidth={3} />,
  skipped:   <Circle size={10} />,
  pending:   <Circle size={10} />,
};

const STATUS_DOT: Record<PhaseStatus, string> = {
  completed: 'bg-[var(--success)] text-white',
  running:   'bg-[var(--info)] text-white',
  failed:    'bg-[var(--destructive)] text-white',
  skipped:   'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)]',
  pending:   'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]',
};

const PHASE_COLORS: Record<string, string> = {
  spec: 'text-violet-400',
  planning: 'text-amber-400',
  coding: 'text-[var(--info)]',
  qa: 'text-purple-400',
};

export function PhaseTimeline({ phases, className }: Props) {
  if (!phases.length) return null;
  return (
    <div className={cn('flex flex-col', className)}>
      {phases.map((phase, i) => {
        const dur = duration(phase.started_at, phase.completed_at);
        return (
          <div key={phase.name} className="flex gap-3">
            {/* Left: dot + connecting line */}
            <div className="flex flex-col items-center">
              <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px]', STATUS_DOT[phase.status])}>
                {STATUS_ICON[phase.status]}
              </div>
              {i < phases.length - 1 && (
                <div className="w-px flex-1 bg-[var(--border-subtle)] my-1" style={{ minHeight: 12 }} />
              )}
            </div>
            {/* Right: content */}
            <div className={cn('pb-3 flex flex-col gap-0.5', i === phases.length - 1 && 'pb-0')}>
              <div className="flex items-center gap-2">
                <span className={cn('text-xs font-semibold', PHASE_COLORS[phase.name] ?? 'text-[var(--text-secondary)]')}>
                  {phase.label}
                </span>
                {phase.model && (
                  <span className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1 py-px text-[10px] text-[var(--text-muted)]">
                    {phase.model.replace('claude-', '').replace('-4-6', ' 4.6').replace('-4-5', ' 4.5')}
                  </span>
                )}
                {dur && (
                  <span className="text-[10px] text-[var(--text-muted)]">{dur}</span>
                )}
              </div>
              {phase.error && (
                <span className="text-[11px] text-[var(--destructive)]">{phase.error}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
