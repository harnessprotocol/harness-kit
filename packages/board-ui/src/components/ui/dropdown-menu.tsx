import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';

interface DropdownMenuProps {
  children: React.ReactNode;
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  return <div className="relative inline-flex">{children}</div>;
}

interface DropdownMenuTriggerProps {
  asChild?: boolean;
  children: React.ReactElement;
}

export function DropdownMenuTrigger({ children, asChild, ...props }: DropdownMenuTriggerProps & React.HTMLAttributes<HTMLElement>) {
  // The trigger just renders children — the parent DropdownMenu manages state via context
  // For simplicity, we use a click-based approach
  return <>{children}</>;
}

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'end';
  open?: boolean;
  onClose?: () => void;
}

export function DropdownMenuContent({ align = 'end', className, children, open, onClose, ...props }: DropdownMenuContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose?.();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-50 min-w-[8rem] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-1 shadow-md',
        align === 'end' ? 'right-0' : 'left-0',
        'top-full mt-1',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex cursor-pointer select-none items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-2 py-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('-mx-1 my-1 h-px bg-[var(--border)]', className)} {...props} />;
}
