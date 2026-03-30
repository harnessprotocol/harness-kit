import { Info, AlertTriangle, CheckCircle, GitBranch } from 'lucide-react';
import { cn } from '../lib/utils';

type Variant = 'info' | 'warning' | 'success' | 'teal';

const VARIANT_CONFIG: Record<Variant, { icon: React.ComponentType<{ size: number; className?: string }>; classes: string; iconClass: string }> = {
  info:    { icon: Info,          classes: 'border-blue-500/20 bg-blue-500/[0.06]',    iconClass: 'text-blue-400' },
  warning: { icon: AlertTriangle, classes: 'border-yellow-500/20 bg-yellow-500/[0.06]', iconClass: 'text-yellow-400' },
  success: { icon: CheckCircle,   classes: 'border-green-500/20 bg-green-500/[0.06]',  iconClass: 'text-green-400' },
  teal:    { icon: GitBranch,     classes: 'border-teal-500/20 bg-teal-500/[0.06]',    iconClass: 'text-teal-400' },
};

interface Props {
  variant?: Variant;
  title?: string;
  message: string;
  toggle?: { enabled: boolean; onToggle: (v: boolean) => void; label: string };
  className?: string;
}

export function InfoBanner({ variant = 'info', title, message, toggle, className }: Props) {
  const { icon: Icon, classes, iconClass } = VARIANT_CONFIG[variant];
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-3', classes, className)}>
      <Icon size={16} className={cn('mt-0.5 shrink-0', iconClass)} />
      <div className="flex flex-1 flex-col gap-0.5">
        {title && <span className="text-xs font-semibold text-[var(--text-primary)]">{title}</span>}
        <span className="text-xs leading-relaxed text-[var(--text-secondary)]">{message}</span>
      </div>
      {toggle && (
        <button
          type="button"
          onClick={() => toggle.onToggle(!toggle.enabled)}
          className={cn(
            'relative h-5 w-9 shrink-0 cursor-pointer rounded-full border-none transition-colors duration-200',
            toggle.enabled ? 'bg-[var(--cta-bg)]' : 'bg-[var(--bg-elevated)]',
          )}
          title={toggle.label}
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
              toggle.enabled ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}
          />
        </button>
      )}
    </div>
  );
}
