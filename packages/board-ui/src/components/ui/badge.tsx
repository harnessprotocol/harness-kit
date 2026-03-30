import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'purple' | 'muted';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent',
  secondary: 'bg-[var(--secondary)] text-[var(--foreground)] border-transparent',
  destructive: 'bg-[var(--destructive)]/10 text-[var(--destructive)] border-[var(--destructive)]/30',
  outline: 'bg-transparent text-[var(--foreground)] border-[var(--border)]',
  success: 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30',
  warning: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/30',
  info: 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/30',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  muted: 'bg-[var(--muted)] text-[var(--muted-foreground)] border-transparent',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-md)] border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
