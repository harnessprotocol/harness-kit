import { cn } from '../../lib/utils';

interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  'aria-label'?: string;
}

export function Checkbox({ checked, onCheckedChange, onClick, className, ...props }: CheckboxProps) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        onClick?.(e);
        onCheckedChange?.(!checked);
      }}
      className={cn(
        'h-4 w-4 shrink-0 rounded-[3px] border cursor-pointer transition-colors',
        checked
          ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-foreground)]'
          : 'border-[var(--muted-foreground)]/40 bg-transparent',
        className,
      )}
      {...props}
    >
      {checked && (
        <svg className="h-3 w-3 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
