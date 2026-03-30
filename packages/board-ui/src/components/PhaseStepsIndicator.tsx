import { cn } from '../lib/utils';

type PhaseStatus = 'completed' | 'active' | 'failed' | 'pending';

interface Phase {
  name: string;
  label: string;
  status: PhaseStatus;
}

interface Props {
  currentPhase?: string;  // name of the currently active phase
  completedPhases?: string[];
  failedPhase?: string;
  className?: string;
}

const PHASES = [
  { name: 'spec',     label: 'Spec' },
  { name: 'planning', label: 'Plan' },
  { name: 'coding',   label: 'Code' },
  { name: 'qa',       label: 'QA' },
];

const STATUS_CLASSES: Record<PhaseStatus, string> = {
  completed: 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/20',
  active:    'bg-[var(--info)]/15 text-[var(--info)] border-[var(--info)]/20 animate-pulse',
  failed:    'bg-[var(--destructive)]/15 text-[var(--destructive)] border-[var(--destructive)]/20',
  pending:   'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]',
};

export function PhaseStepsIndicator({ currentPhase, completedPhases = [], failedPhase, className }: Props) {
  if (!currentPhase && completedPhases.length === 0) return null;

  const getStatus = (name: string): PhaseStatus => {
    if (name === failedPhase) return 'failed';
    if (completedPhases.includes(name)) return 'completed';
    if (name === currentPhase) return 'active';
    return 'pending';
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {PHASES.map((phase, i) => {
        const status = getStatus(phase.name);
        if (status === 'pending' && !currentPhase) return null; // hide pending if not started
        return (
          <div key={phase.name} className="flex items-center gap-1">
            {i > 0 && status !== 'pending' && (
              <div className="h-px w-2 bg-[var(--border-subtle)]" />
            )}
            <span
              className={cn(
                'rounded-full border px-1.5 py-px text-[9px] font-medium',
                STATUS_CLASSES[status],
              )}
            >
              {phase.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
