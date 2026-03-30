import { useState, useRef, useEffect } from 'react';
import { Sparkles, Brain, Scale, Zap, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ size: number; className?: string }>> = {
  sparkles: Sparkles,
  brain: Brain,
  scale: Scale,
  zap: Zap,
};

const DEFAULT_PROFILES: AgentProfile[] = [
  { id: 'auto',    name: 'Auto (Optimized)',  description: 'Best model per phase, optimized thinking', icon: 'sparkles' },
  { id: 'complex', name: 'Complex Tasks',     description: 'Opus for all phases — maximum quality',    icon: 'brain' },
  { id: 'balanced',name: 'Balanced',          description: 'Sonnet across all phases — speed + quality',icon: 'scale' },
  { id: 'quick',   name: 'Quick Edits',       description: 'Fast model for simple, focused changes',    icon: 'zap' },
];

interface Props {
  value: string;
  profiles?: AgentProfile[];
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function AgentProfileSelect({ value, profiles = DEFAULT_PROFILES, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = profiles.find(p => p.id === value) ?? profiles[0];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const SelectedIcon = ICON_MAP[selected?.icon ?? 'sparkles'] ?? Sparkles;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-left transition-colors',
          'cursor-pointer hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)]',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <SelectedIcon size={16} className="shrink-0 text-[var(--cta-bg)]" />
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium text-[var(--text-primary)]">{selected?.name}</span>
          <span className="text-xs text-[var(--text-muted)]">{selected?.description}</span>
        </div>
        <ChevronDown size={14} className={cn('shrink-0 text-[var(--text-muted)] transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 right-0 z-50 mt-1 flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-1.5 shadow-xl"
          >
            {profiles.map(profile => {
              const Icon = ICON_MAP[profile.icon] ?? Sparkles;
              const isSelected = profile.id === value;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => { onChange(profile.id); setOpen(false); }}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors cursor-pointer',
                    isSelected
                      ? 'bg-[var(--cta-bg)]/10 text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
                  )}
                >
                  <Icon size={14} className={cn('shrink-0', isSelected ? 'text-[var(--cta-bg)]' : 'text-[var(--text-muted)]')} />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{profile.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">{profile.description}</span>
                  </div>
                  {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-[var(--cta-bg)]" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
