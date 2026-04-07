// apps/desktop/src/components/agent/LogsTab.tsx
// Ported from docs/plans/agent-ui-mock.html:
// .logs-body, .log-entry, .log-ts, .log-thought, .tool-block, .tool-block-inner,
// .tool-header, .tool-label, .tool-path, .tool-status-row, .toggle-btn,
// .tool-output, .tool-output-inner, .output-line, .output-ln, .output-text

import React, { useState, useRef, useEffect } from 'react';
import type { AgentEvent } from '../../lib/agent-api';

// ── Color mappings — ported from mock CSS variables ───────────────────────────

const ACTION_COLORS: Record<string, string> = {
  reading: '#4B9EFF',   // --blue
  listing: '#4B9EFF',   // --blue
  editing: '#A78BFA',   // --purple
  writing: '#A78BFA',   // --purple
  running: '#FB923C',   // --orange
  board:   '#34D399',   // --green
};

const LABEL_STYLES: Record<string, React.CSSProperties> = {
  reading:  { background: 'rgba(75,158,255,.12)',  color: '#4B9EFF', border: '1px solid rgba(75,158,255,.25)' },
  listing:  { background: 'rgba(75,158,255,.12)',  color: '#4B9EFF', border: '1px solid rgba(75,158,255,.25)' },
  editing:  { background: 'rgba(167,139,250,.12)', color: '#A78BFA', border: '1px solid rgba(167,139,250,.25)' },
  writing:  { background: 'rgba(167,139,250,.12)', color: '#A78BFA', border: '1px solid rgba(167,139,250,.25)' },
  running:  { background: 'rgba(251,146,60,.12)',  color: '#FB923C', border: '1px solid rgba(251,146,60,.25)' },
  board:    { background: 'rgba(52,211,153,.12)',  color: '#34D399', border: '1px solid rgba(52,211,153,.25)' },
};

// ── Style constants — ported verbatim from mock ───────────────────────────────

const S = {
  // .logs-body
  body: {
    padding: '8px 0',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  // .log-entry
  entry: { padding: '10px 24px 6px' },
  // .log-ts
  ts: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10,
    color: '#455270',
    marginBottom: 4,
    letterSpacing: '.02em',
  },
  // .log-thought
  thought: {
    color: '#B8C4D4',
    lineHeight: 1.55,
    fontSize: 13,
    marginBottom: 8,
  },
  // .tool-block
  blockWrap: { margin: '0 0 6px', overflow: 'hidden' as const },
  // .tool-block-inner + colored left border
  blockInner: (action: string): React.CSSProperties => ({
    background: '#141D2F',
    borderTop: '1px solid #1F2D44',
    borderBottom: '1px solid #1F2D44',
    borderLeft: `2.5px solid ${ACTION_COLORS[action] ?? '#6B7FA0'}`,
    borderRight: 'none',
  }),
  // .tool-header
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' },
  // .tool-file-icon
  fileIcon: { opacity: .5, fontSize: 12, flexShrink: 0 } as React.CSSProperties,
  // .tool-label
  labelPill: (action: string): React.CSSProperties => ({
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 3,
    fontFamily: 'JetBrains Mono, monospace',
    letterSpacing: '.05em',
    flexShrink: 0,
    ...(LABEL_STYLES[action] ?? LABEL_STYLES.reading),
  }),
  // .tool-path
  path: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    color: '#E8EDF5',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  // .tool-status-row
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 16px',
    borderTop: '1px solid rgba(255,255,255,.04)',
  },
  // .tool-check
  check: { color: '#34D399', fontSize: 11 },
  // .tool-done
  done: { fontSize: 11, color: '#455270' },
  // .toggle-btn
  toggleBtn: {
    fontSize: 10,
    color: '#455270',
    cursor: 'pointer',
    padding: '2px 7px',
    borderRadius: 3,
    border: '1px solid #1F2D44',
    background: 'transparent',
    fontFamily: 'JetBrains Mono, monospace',
    letterSpacing: '.02em',
  } as React.CSSProperties,
  // .tool-output
  outputWrap: { background: '#0D1422', borderTop: '1px solid #1F2D44' },
  // .tool-output-inner
  outputInner: { padding: '10px 0', overflowY: 'auto' as const, maxHeight: 180 },
  // .output-line
  outputLine: (isErr: boolean): React.CSSProperties => ({
    display: 'flex',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    lineHeight: 1.65,
    color: isErr ? '#F87171' : undefined,
  }),
  // .output-ln
  lineNo: {
    minWidth: 40,
    padding: '0 12px',
    color: '#455270',
    textAlign: 'right' as const,
    userSelect: 'none' as const,
    flexShrink: 0,
    borderRight: '1px solid #1F2D44',
  },
  // .output-text
  lineText: {
    padding: '0 14px',
    color: '#6B7FA0',
    wordBreak: 'break-all' as const,
    flex: 1,
  },
};

// ── Log entry model ───────────────────────────────────────────────────────────

interface LogEntry {
  ts: string;
  thought?: string;
  tool?: {
    action: string;
    path: string;
    output?: string[];
    error?: boolean;
  };
}

function eventsToEntries(events: AgentEvent[]): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const e of events) {
    if (e.type === 'agent_thought') {
      entries.push({ ts: e.timestamp, thought: e.text });
    } else if (e.type === 'agent_tool' && e.state === 'done') {
      const toolEntry = {
        action: e.action,
        path: e.path,
        output: e.output,
        error: false,
      };
      const last = entries[entries.length - 1];
      if (last && !last.tool) {
        last.tool = toolEntry;
      } else {
        entries.push({ ts: new Date().toISOString(), tool: toolEntry });
      }
    } else if (e.type === 'agent_tool' && e.state === 'error') {
      entries.push({
        ts: new Date().toISOString(),
        tool: { action: e.action, path: e.path, output: e.output, error: true },
      });
    }
  }
  return entries;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  taskId: number;
  events: AgentEvent[];
}

export function LogsTab({ events }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  const entries = eventsToEntries(events);

  const toggle = (key: string) =>
    setExpanded(s => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  if (entries.length === 0) {
    return (
      <div style={{ padding: '24px', color: '#455270', fontSize: 13, textAlign: 'center' }}>
        Waiting for agent events…
      </div>
    );
  }

  return (
    <div style={S.body}>
      {entries.map((entry, i) => (
        <div key={i} style={S.entry}>
          {entry.ts && (
            <div style={S.ts}>{new Date(entry.ts).toLocaleString()}</div>
          )}
          {entry.thought && (
            <div style={S.thought}>{entry.thought}</div>
          )}
          {entry.tool && (() => {
            const { action, path, output, error } = entry.tool;
            const key = `${i}`;
            const isExp = expanded.has(key);
            const label = action.charAt(0).toUpperCase() + action.slice(1);
            return (
              <div style={S.blockWrap}>
                <div style={S.blockInner(action)}>
                  {/* .tool-header */}
                  <div style={S.header}>
                    <span style={S.fileIcon}>⊟</span>
                    <span style={S.labelPill(action)}>{label}</span>
                    <span style={S.path}>{path}</span>
                  </div>
                  {/* .tool-status-row */}
                  <div style={S.statusRow}>
                    <span style={S.check}>✓</span>
                    <span style={S.done}>{error ? 'Error' : 'Done'}</span>
                    {output && output.length > 0 && (
                      <button
                        style={S.toggleBtn}
                        onClick={() => toggle(key)}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = '#4B9EFF';
                          (e.currentTarget as HTMLButtonElement).style.color = '#4B9EFF';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = '#1F2D44';
                          (e.currentTarget as HTMLButtonElement).style.color = '#455270';
                        }}
                      >
                        {isExp ? '˅ Hide output' : '› Show output'}
                      </button>
                    )}
                  </div>
                  {/* .tool-output */}
                  {isExp && output && (
                    <div style={S.outputWrap}>
                      <div style={S.outputInner}>
                        {output.map((line, n) => (
                          <div key={n} style={S.outputLine(!!error)}>
                            <span style={S.lineNo}>{n + 1}</span>
                            <span style={S.lineText}>{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
