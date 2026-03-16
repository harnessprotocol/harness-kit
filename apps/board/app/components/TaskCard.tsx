'use client';

import type { Task } from '../lib/api';
import { COLUMN_META } from '../lib/columns';
import { Tooltip } from './Tooltip';

interface Props {
  task: Task;
  onClick?: () => void;
  repoUrl?: string;
}

export function TaskCard({ task, onClick, repoUrl }: Props) {
  const statusColor = COLUMN_META[task.status]?.color ?? 'var(--text-muted)';

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid ${task.blocked ? 'var(--blocked)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'border-color 0.1s, background 0.1s',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = task.blocked ? 'var(--blocked)' : 'var(--accent)';
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = task.blocked ? 'var(--blocked)' : 'var(--border)';
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4 }}>
          {task.title}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
          #{task.id}
        </span>
      </div>

      {/* Epic badge */}
      {task.epic_name && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            background: 'var(--bg-surface)',
            borderRadius: 10,
            padding: '1px 6px',
            border: '1px solid var(--border-subtle)',
            alignSelf: 'flex-start',
          }}
        >
          {task.epic_name}
        </span>
      )}

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        {/* Blocked indicator */}
        {task.blocked && (
          <Tooltip text="Blocked \u2014 click to see reason" position="top">
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--blocked)',
                background: 'rgba(220, 38, 38, 0.1)',
                borderRadius: 4,
                padding: '1px 5px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Blocked
            </span>
          </Tooltip>
        )}

        {/* Branch */}
        {task.branch && (
          repoUrl ? (
            <a
              href={`${repoUrl}/tree/${task.branch}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 140,
                textDecoration: 'none',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--accent)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              {task.branch}
            </a>
          ) : (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 140,
              }}
            >
              {task.branch}
            </span>
          )
        )}

        {/* Comment count */}
        {task.comments.length > 0 && (
          <Tooltip text={`${task.comments.length} comment(s) \u2014 click to view`} position="top">
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              💬 {task.comments.length}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
