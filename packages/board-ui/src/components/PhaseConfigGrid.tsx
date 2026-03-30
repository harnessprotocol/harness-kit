import { cn } from '../lib/utils';
import type { PhaseConfig } from '../lib/api';

export type { PhaseConfig };

const PHASE_LABELS: Record<string, string> = {
  spec: 'Spec Creation',
  planning: 'Planning',
  coding: 'Coding',
  qa: 'QA Review',
};

const PHASE_COLORS: Record<string, string> = {
  spec: 'text-violet-400',
  planning: 'text-amber-400',
  coding: 'text-blue-400',
  qa: 'text-purple-400',
};

const MODELS = [
  { value: 'claude-opus-4-6',    label: 'Opus 4.6' },
  { value: 'claude-sonnet-4-6',  label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5',   label: 'Haiku 4.5' },
];

interface Props {
  phases: PhaseConfig[];
  onChange: (phases: PhaseConfig[]) => void;
  disabled?: boolean;
}

export function PhaseConfigGrid({ phases, onChange, disabled }: Props) {
  function updatePhase(name: string, updates: Partial<PhaseConfig>) {
    onChange(phases.map(p => p.name === name ? { ...p, ...updates } : p));
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {phases.map(phase => (
        <div
          key={phase.name}
          className={cn(
            'flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3',
            !phase.enabled && 'opacity-50',
          )}
        >
          <div className="flex items-center justify-between">
            <span className={cn('text-xs font-semibold', PHASE_COLORS[phase.name] ?? 'text-[var(--text-secondary)]')}>
              {PHASE_LABELS[phase.name] ?? phase.name}
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => updatePhase(phase.name, { enabled: !phase.enabled })}
              className={cn(
                'relative h-4 w-7 cursor-pointer rounded-full border-none transition-colors',
                phase.enabled ? 'bg-[var(--cta-bg)]' : 'bg-[var(--bg-base)]',
                disabled && 'cursor-not-allowed',
              )}
              title={phase.enabled ? 'Disable phase' : 'Enable phase'}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform',
                  phase.enabled ? 'translate-x-3.5' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>
          <select
            value={phase.model}
            disabled={disabled || !phase.enabled}
            onChange={e => updatePhase(phase.name, { model: e.target.value })}
            className="w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
