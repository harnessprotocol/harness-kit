import { cn } from '../lib/utils';

export interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface Props {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function TabBar({ tabs, activeTab, onTabChange, className }: Props) {
  return (
    <div className={cn('flex border-b border-[var(--border-subtle)]', className)}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative flex cursor-pointer items-center gap-1.5 border-none bg-transparent px-4 py-2.5 text-xs font-medium transition-colors',
              isActive
                ? 'text-[var(--text-primary)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[var(--accent)] after:content-[""]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={cn(
                'rounded-full px-1.5 py-px text-[10px] font-semibold',
                isActive ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
