import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  title: string;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  badge?: string;
  className?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultOpen = false, icon, badge, className, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('flex flex-col', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-0 py-1.5 text-left"
      >
        {icon}
        <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">{title}</span>
        {badge && (
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-px text-[10px] text-[var(--text-muted)]">
            {badge}
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn('text-[var(--text-muted)] transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="pt-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
