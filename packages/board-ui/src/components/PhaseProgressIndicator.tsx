import { memo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import type { ExecutionPhase, Subtask } from '../lib/api';

interface PhaseProgressIndicatorProps {
  phase?: string; // ExecutionPhase
  subtasks: Array<{ id: number; status: string; title?: string }>;
  phaseProgress?: number;
  isRunning?: boolean;
  className?: string;
}

// Phase display configuration — colors mapped to our ExecutionPhase values
const PHASE_COLORS: Record<string, { color: string; bgColor: string }> = {
  idle:     { color: 'bg-muted-foreground',  bgColor: 'bg-muted' },
  spec:     { color: 'bg-amber-500',         bgColor: 'bg-amber-500/20' },
  planning: { color: 'bg-amber-500',         bgColor: 'bg-amber-500/20' },
  coding:   { color: 'bg-[var(--info,#3b82f6)]', bgColor: 'bg-[var(--info,#3b82f6)]/20' },
  qa:       { color: 'bg-purple-500',        bgColor: 'bg-purple-500/20' },
  complete: { color: 'bg-[var(--success,#22c55e)]', bgColor: 'bg-[var(--success,#22c55e)]/20' },
  failed:   { color: 'bg-[var(--destructive,#ef4444)]', bgColor: 'bg-[var(--destructive,#ef4444)]/20' },
};

// Phase labels (hardcoded English, no i18n)
const PHASE_LABELS: Record<string, string> = {
  idle:     'Idle',
  spec:     'Spec',
  planning: 'Planning',
  coding:   'Coding',
  qa:       'Reviewing',
  complete: 'Complete',
  failed:   'Failed',
};

/**
 * Consolidated progress indicator that replaces ProgressBar, ProgressDots,
 * and PhaseStepsIndicator. Adapts display based on execution phase:
 *
 * - Spec/Planning/QA: Indeterminate sliding bar with activity dot
 * - Coding: Determinate progress bar from subtask completion
 * - Subtask dots: Staggered entrance animation, overflow "+N"
 * - Phase steps: "Spec — Plan — Code — QA" pills with checkmarks
 *
 * Uses IntersectionObserver to pause animations when off-screen.
 */
export const PhaseProgressIndicator = memo(function PhaseProgressIndicator({
  phase: rawPhase,
  subtasks,
  phaseProgress,
  isRunning = false,
  className,
}: PhaseProgressIndicatorProps) {
  const phase = (rawPhase || 'idle') as string;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Pause animations when component scrolls out of view
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const shouldAnimate = isVisible && isRunning;

  // Subtask-based progress
  const completedSubtasks = subtasks.filter(s => s.status === 'completed').length;
  const totalSubtasks = subtasks.length;
  const subtaskProgress = totalSubtasks > 0
    ? Math.round((completedSubtasks / totalSubtasks) * 100)
    : 0;

  // Show determinate bar whenever subtasks exist
  const showSubtaskProgress = totalSubtasks > 0;

  // Indeterminate phases: anything that isn't coding and isn't terminal
  const isIndeterminatePhase = phase === 'spec' || phase === 'planning' || phase === 'qa';

  const colors = PHASE_COLORS[phase] || PHASE_COLORS.idle;
  const phaseLabel = PHASE_LABELS[phase] || PHASE_LABELS.idle;

  return (
    <div ref={containerRef} className={cn('space-y-1.5', className)}>
      {/* Progress label row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted-foreground)]">
            {showSubtaskProgress ? 'Progress' : phaseLabel}
          </span>
          {/* Pulsing activity dot for indeterminate phases */}
          {isRunning && isIndeterminatePhase && (
            <motion.div
              className={cn('h-1.5 w-1.5 rounded-full', colors.color)}
              animate={shouldAnimate ? {
                scale: [1, 1.5, 1],
                opacity: [1, 0.5, 1],
              } : { scale: 1, opacity: 1 }}
              transition={shouldAnimate ? {
                duration: 1,
                repeat: Infinity,
                ease: 'easeInOut',
              } : undefined}
            />
          )}
        </div>
        <span className="text-xs font-medium text-[var(--foreground)]">
          {showSubtaskProgress ? (
            `${subtaskProgress}%`
          ) : isRunning && isIndeterminatePhase && (phaseProgress ?? 0) > 0 ? (
            `${Math.round(Math.min(phaseProgress!, 100))}%`
          ) : (
            '\u2014'
          )}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--border,#333)]">
        <AnimatePresence mode="wait">
          {showSubtaskProgress ? (
            // Determinate: width from subtask completion %
            <motion.div
              key="determinate"
              className={cn('h-full rounded-full', colors.color)}
              initial={{ width: 0 }}
              animate={{ width: `${subtaskProgress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          ) : shouldAnimate && isIndeterminatePhase ? (
            // Indeterminate sliding bar
            <motion.div
              key="indeterminate"
              className={cn('absolute h-full w-1/3 rounded-full', colors.color)}
              animate={{ x: ['-100%', '400%'] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ) : isRunning && isIndeterminatePhase && !isVisible ? (
            // Static placeholder when off-screen but running
            <motion.div
              key="indeterminate-static"
              className={cn('absolute h-full w-1/3 rounded-full left-1/3', colors.color)}
            />
          ) : null}
        </AnimatePresence>
      </div>

      {/* Subtask dots */}
      {totalSubtasks > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {subtasks.slice(0, 10).map((subtask, index) => {
            const isInProgress = subtask.status === 'in_progress';
            const shouldPulse = isInProgress && isVisible;

            return (
              <motion.div
                key={subtask.id || `subtask-${index}`}
                className={cn(
                  'h-2 w-2 rounded-full',
                  subtask.status === 'completed' && 'bg-[var(--success,#22c55e)]',
                  isInProgress && 'bg-[var(--info,#3b82f6)]',
                  subtask.status === 'failed' && 'bg-[var(--destructive,#ef4444)]',
                  subtask.status === 'pending' && 'bg-[var(--muted-foreground)]/30',
                )}
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  ...(shouldPulse && {
                    boxShadow: [
                      '0 0 0 0 rgba(59,130,246,0.4)',
                      '0 0 0 4px rgba(59,130,246,0)',
                    ],
                  }),
                }}
                transition={{
                  scale: { delay: index * 0.03, duration: 0.2 },
                  opacity: { delay: index * 0.03, duration: 0.2 },
                  boxShadow: shouldPulse
                    ? { duration: 1, repeat: Infinity, ease: 'easeOut' }
                    : undefined,
                }}
                title={`${subtask.title || subtask.id}: ${subtask.status}`}
              />
            );
          })}
          {totalSubtasks > 10 && (
            <span className="text-[10px] text-[var(--muted-foreground)] font-medium ml-0.5">
              +{totalSubtasks - 10}
            </span>
          )}
        </div>
      )}

      {/* Phase steps indicator — shows overall flow */}
      {(isRunning || phase !== 'idle') && (
        <PhaseSteps currentPhase={phase} isVisible={isVisible} />
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Mini phase-steps row: "Spec — Plan — Code — QA"
// ---------------------------------------------------------------------------

const STEP_PHASES: { key: string; label: string }[] = [
  { key: 'spec',     label: 'Spec' },
  { key: 'planning', label: 'Plan' },
  { key: 'coding',   label: 'Code' },
  { key: 'qa',       label: 'QA' },
];

const PHASE_ORDER = ['spec', 'planning', 'coding', 'qa', 'complete'];

function PhaseSteps({ currentPhase, isVisible = true }: { currentPhase: string; isVisible?: boolean }) {
  const getState = (key: string): 'complete' | 'active' | 'failed' | 'pending' => {
    const currentIdx = PHASE_ORDER.indexOf(currentPhase);
    const keyIdx = PHASE_ORDER.indexOf(key);

    if (currentPhase === 'failed') return 'failed';
    if (currentPhase === 'complete') return 'complete';
    if (key === currentPhase) return 'active';
    if (keyIdx < currentIdx && keyIdx !== -1 && currentIdx !== -1) return 'complete';
    return 'pending';
  };

  return (
    <div className="flex items-center gap-1 mt-2">
      {STEP_PHASES.map((step, index) => {
        const state = getState(step.key);
        const shouldAnimate = state === 'active' && isVisible;

        return (
          <div key={step.key} className="flex items-center">
            <motion.div
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium',
                state === 'complete' && 'bg-[var(--success,#22c55e)]/10 text-[var(--success,#22c55e)]',
                state === 'active'   && 'bg-[var(--primary,#6366f1)]/10 text-[var(--primary,#6366f1)]',
                state === 'failed'   && 'bg-[var(--destructive,#ef4444)]/10 text-[var(--destructive,#ef4444)]',
                state === 'pending'  && 'bg-[var(--muted,#1e1e1e)] text-[var(--muted-foreground)]',
              )}
              animate={shouldAnimate ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
              transition={shouldAnimate ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : undefined}
            >
              {state === 'complete' && (
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {step.label}
            </motion.div>
            {index < STEP_PHASES.length - 1 && (
              <div
                className={cn(
                  'w-2 h-px mx-0.5',
                  getState(STEP_PHASES[index + 1].key) !== 'pending' ? 'bg-[var(--success,#22c55e)]/50' : 'bg-[var(--border,#333)]',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
