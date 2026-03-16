'use client';

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
    <div
      style={{
        display: 'flex',
        background: 'var(--bg-elevated)',
        borderRadius: 6,
        border: '1px solid var(--border-subtle)',
        padding: 2,
        gap: 2,
      }}
    >
      {(['columns', 'swimlane'] as ViewMode[]).map(v => (
        <Tooltip key={v} text={VIEW_TOOLTIPS[v]} position="bottom">
          <button
            onClick={() => onChange(v)}
            title={v === 'columns' ? 'Column view' : 'Swimlane view'}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: 'none',
              background: mode === v ? 'var(--bg-hover)' : 'transparent',
              color: mode === v ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: mode === v ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.1s',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {v === 'columns' ? (
              <>
                <span style={{ fontSize: 13 }}>⣿</span> Columns
              </>
            ) : (
              <>
                <span style={{ fontSize: 13 }}>≡</span> Swimlane
              </>
            )}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
