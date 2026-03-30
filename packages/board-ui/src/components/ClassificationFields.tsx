import { cn } from '../lib/utils';

export type TaskCategory = 'feature' | 'bug_fix' | 'refactor' | 'docs' | 'security' | 'performance' | 'ui_ux';
export type TaskComplexity = 'trivial' | 'small' | 'medium' | 'large' | 'complex';

interface Props {
  category?: string;
  complexity?: string;
  onCategoryChange: (v: string) => void;
  onComplexityChange: (v: string) => void;
  disabled?: boolean;
}

const SELECT_CLASS = 'w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 font-[inherit] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';
const LABEL_CLASS = 'text-xs font-medium text-[var(--text-muted)]';

export function ClassificationFields({ category, complexity, onCategoryChange, onComplexityChange, disabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <label className={LABEL_CLASS}>Category</label>
        <select
          value={category ?? ''}
          onChange={e => onCategoryChange(e.target.value)}
          disabled={disabled}
          className={cn(SELECT_CLASS, disabled && 'cursor-not-allowed opacity-50')}
        >
          <option value="">None</option>
          <option value="feature">Feature</option>
          <option value="bug_fix">Bug Fix</option>
          <option value="refactor">Refactor</option>
          <option value="docs">Docs</option>
          <option value="security">Security</option>
          <option value="performance">Performance</option>
          <option value="ui_ux">UI/UX</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={LABEL_CLASS}>Complexity</label>
        <select
          value={complexity ?? ''}
          onChange={e => onComplexityChange(e.target.value)}
          disabled={disabled}
          className={cn(SELECT_CLASS, disabled && 'cursor-not-allowed opacity-50')}
        >
          <option value="">Unknown</option>
          <option value="trivial">Trivial</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="complex">Complex</option>
        </select>
      </div>
    </div>
  );
}
