import { cn } from '../../lib/utils';

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'ghost' | 'warning';
type ButtonSize = 'default' | 'sm' | 'icon';

const variantStyles: Record<ButtonVariant, string> = {
  default: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90',
  destructive: 'bg-[var(--destructive)] text-white hover:opacity-90',
  outline: 'border border-[var(--border)] bg-transparent hover:bg-[var(--muted)]',
  ghost: 'bg-transparent hover:bg-[var(--muted)]',
  warning: 'bg-[var(--warning)] text-[var(--primary-foreground)] hover:opacity-90',
};

const sizeStyles: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2 text-sm',
  sm: 'h-7 px-2.5 text-xs',
  icon: 'h-8 w-8',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'default', size = 'default', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  );
}
