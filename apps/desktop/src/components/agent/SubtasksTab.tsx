// apps/desktop/src/components/agent/SubtasksTab.tsx
// Ported from docs/plans/agent-ui-mock.html:
// .subtasks-body, .phase-group, .phase-group-header, .pgn, .pgc,
// .subtask-list, .subtask-row, .st-icon, .st-title

import React from 'react';
import type { Task } from '../../lib/board-api';

const GROUPS = [
  { key: 'planning', label: 'Planning', color: '#FBBF24' },  // --yellow
  { key: 'coding',   label: 'Coding',   color: '#4B9EFF' },  // --blue
  { key: 'qa',       label: 'QA',       color: '#34D399' },  // --green
] as const;

export function SubtasksTab({ task }: { task: Task }) {
  return (
    // .subtasks-body
    <div style={{ paddingBottom: 8 }}>
      {GROUPS.map(({ key, label, color }) => {
        // Filter subtasks by phase, default phase to 'coding' if unset
        const items = task.subtasks.filter(s => {
          const phase = s.phase ?? 'coding';
          if (key === 'qa') return phase === 'qa' || phase === 'qa_review' || phase === 'qa_fixing';
          return phase === key;
        });
        if (items.length === 0) return null;

        const done = items.filter(s => s.status === 'completed').length;

        return (
          // .phase-group
          <div key={key} style={{ borderBottom: '1px solid #1F2D44' }}>
            {/* .phase-group-header */}
            <div style={{
              padding: '10px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,.02)',
              position: 'sticky',
              top: 0,
              zIndex: 2,
            }}>
              {/* .pgn */}
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                fontFamily: 'JetBrains Mono, monospace',
                color,
              }}>
                {label}
              </span>
              {/* .pgc */}
              <span style={{
                fontSize: 11,
                color: '#6B7FA0',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                {done}/{items.length}
              </span>
            </div>

            {/* .subtask-list */}
            <div style={{ padding: '2px 0' }}>
              {items.map(s => {
                const isDone   = s.status === 'completed';
                const isActive = s.status === 'in_progress';

                // .st-icon states: done, active, pending
                const iconStyle: React.CSSProperties = {
                  width: 17,
                  height: 17,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  flexShrink: 0,
                  fontWeight: 700,
                  ...(isDone
                    ? { background: 'rgba(52,211,153,.15)', color: '#34D399', border: '1px solid rgba(52,211,153,.25)' }
                    : isActive
                    ? { background: 'rgba(75,158,255,.12)', color: '#4B9EFF', border: '1px solid rgba(75,158,255,.25)',
                        animation: 'agent-pulse 1.5s ease-in-out infinite' }
                    : { background: 'transparent', border: '1px solid #253352', color: '#455270' }),
                };

                // .st-title states
                const titleStyle: React.CSSProperties = {
                  fontSize: 12.5,
                  lineHeight: 1.4,
                  color: isDone ? '#6B7FA0' : isActive ? '#E8EDF5' : '#6B7FA0',
                  textDecoration: isDone ? 'line-through' : 'none',
                  textDecorationColor: '#455270',
                };

                return (
                  // .subtask-row
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '7px 24px',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.02)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={iconStyle}>
                      {isDone ? '✓' : isActive ? '◉' : ''}
                    </div>
                    <div style={titleStyle}>{s.title}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
