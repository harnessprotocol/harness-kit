import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface Props {
  value?: number;       // 0-100, undefined = indeterminate
  loading?: boolean;    // true = show indeterminate animation
  color?: string;       // CSS color or Tailwind class — default: var(--cta-bg)
  shimmer?: boolean;    // true = add shimmer to determinate bar
  height?: string;      // Tailwind height class — default: 'h-1'
  className?: string;
  showLabel?: boolean;  // show percentage label to the right
}

export function ProgressBar({ value, loading = false, color, shimmer = false, height = 'h-1', className, showLabel = false }: Props) {
  const isDeterminate = value !== undefined;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('relative flex-1 overflow-hidden rounded-full bg-[var(--bg-base)]', height)}>
        {isDeterminate ? (
          <motion.div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              shimmer && 'progress-bar-shimmer',
            )}
            style={!shimmer ? { backgroundColor: color ?? 'var(--cta-bg)' } : undefined}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />
        ) : loading ? (
          <div
            className="absolute inset-y-0 left-0 w-1/3 rounded-full"
            style={{
              backgroundColor: color ?? 'var(--cta-bg)',
              animation: 'progress-indeterminate 1.5s ease-in-out infinite',
            }}
          />
        ) : null}
      </div>
      {showLabel && isDeterminate && (
        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{Math.round(value)}%</span>
      )}
    </div>
  );
}
