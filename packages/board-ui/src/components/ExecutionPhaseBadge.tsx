import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

const PHASE_CONFIG: Record<string, { label: string; className: string }> = {
  spec:     { label: 'Spec',     className: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
  planning: { label: 'Planning', className: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  coding:   { label: 'Coding',   className: 'bg-[var(--info)]/15 text-[var(--info)] border-[var(--info)]/20' },
  qa:       { label: 'QA',       className: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  idle:     { label: 'Idle',     className: 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]' },
  complete: { label: 'Done',     className: 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/20' },
  failed:   { label: 'Failed',   className: 'bg-[var(--destructive)]/15 text-[var(--destructive)] border-[var(--destructive)]/20' },
};

interface Props {
  phase: string;
  isRunning?: boolean;
  className?: string;
}

export function ExecutionPhaseBadge({ phase, isRunning = false, className }: Props) {
  const config = PHASE_CONFIG[phase] ?? PHASE_CONFIG.idle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium',
        config.className,
        className,
      )}
    >
      {isRunning && <Loader2 size={9} className="animate-spin" />}
      {config.label}
    </span>
  );
}
