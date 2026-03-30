import { cn } from '../lib/utils';
import { Tooltip } from './Tooltip';

export type ViewMode = 'columns' | 'swimlane';

const VIEW_TOOLTIPS: Record<ViewMode, string> = {
  columns: 'Column view \u2014 tasks grouped by status',
  swimlane: 'Swimlane view \u2014 rows by epic, columns by status',
};

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ mode, onChange }: Props) {
  return (
    <div className="flex rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5 gap-0.5">
      {(['columns', 'swimlane'] as ViewMode[]).map(v => (
        <Tooltip key={v} text={VIEW_TOOLTIPS[v]} position="bottom">
          <button
            onClick={() => onChange(v)}
            title={v === 'columns' ? 'Column view' : 'Swimlane view'}
            className={cn(
              'flex items-center gap-[5px] rounded-[4px] border-none px-2.5 py-1 text-[12px] cursor-pointer transition-all duration-100',
              mode === v
                ? 'bg-[var(--bg-hover)] text-[var(--text-primary)] font-semibold'
                : 'bg-transparent text-[var(--text-muted)] font-normal',
            )}
          >
            {v === 'columns' ? (
              <>
                <span className="text-[13px]">⣿</span> Columns
              </>
            ) : (
              <>
                <span className="text-[13px]">≡</span> Swimlane
              </>
            )}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
