import { Play, Square, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

type ExecutionStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

interface Props {
  status: ExecutionStatus;
  onRun: () => void;
  onStop: () => void;
  disabled?: boolean;
  className?: string;
}

const STATUS_LABEL: Record<ExecutionStatus, string> = {
  idle: 'Not started',
  queued: 'Queued…',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<ExecutionStatus, string> = {
  idle: 'text-[var(--text-muted)]',
  queued: 'text-[var(--warning)]',
  running: 'text-[var(--info)]',
  completed: 'text-[var(--success)]',
  failed: 'text-[var(--destructive)]',
  cancelled: 'text-[var(--text-muted)]',
};

export function RunStopControls({ status, onRun, onStop, disabled, className }: Props) {
  const isRunning = status === 'running' || status === 'queued';
  const canRun = status === 'idle' || status === 'failed' || status === 'cancelled' || status === 'completed';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {isRunning ? (
        <button
          type="button"
          onClick={onStop}
          disabled={disabled}
          title="Stop task"
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--destructive)] transition-colors hover:bg-[var(--destructive)]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Square size={10} strokeWidth={3} />
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={onRun}
          disabled={disabled || !canRun}
          title="Run task"
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={10} strokeWidth={3} />
          Run
        </button>
      )}
      <span className={cn('flex items-center gap-1 text-[11px]', STATUS_COLOR[status])}>
        {status === 'running' && <Loader2 size={10} className="animate-spin" />}
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
