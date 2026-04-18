import { useState } from 'react';
import type { RunningModel, ModelDetails } from '../../lib/tauri';
import type { TurnStats } from '../../hooks/useAIChat';

interface Props {
  model: string;
  modelDetails: ModelDetails | null;
  runningModels: RunningModel[];
  messageStats: { id: string; stats: TurnStats }[];
}

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(0)} MB`;
  return `${(n / 1_024).toFixed(0)} KB`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '7px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          color: 'var(--fg-muted)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {title}
        <span style={{ fontSize: 9, color: 'var(--fg-subtle)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ padding: '0 12px 10px' }}>{children}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--fg-subtle)', fontFamily: 'monospace' }}>{label}</span>
      <span style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'monospace', textAlign: 'right' }}>
        {value ?? '—'}
      </span>
    </div>
  );
}

export function InspectorPanel({ model, modelDetails, runningModels, messageStats }: Props) {
  const totalTokens = messageStats.reduce((sum, s) => sum + (s.stats.evalCount ?? 0), 0);
  const totalPromptTokens = messageStats.reduce((sum, s) => sum + (s.stats.promptEvalCount ?? 0), 0);

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        fontSize: 11,
      }}
    >
      {/* Active model */}
      <Section title="Active Model">
        <Row label="name" value={model || '—'} />
        <Row label="family" value={modelDetails?.family} />
        <Row label="params" value={modelDetails?.parameterSize} />
        <Row label="quant" value={modelDetails?.quantizationLevel} />
        <Row label="ctx" value={modelDetails?.contextLength?.toLocaleString()} />
        {modelDetails?.capabilities && modelDetails.capabilities.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {modelDetails.capabilities.map((cap) => (
              <span
                key={cap}
                style={{
                  fontSize: 9,
                  background: cap === 'tools' ? 'var(--accent)' : 'var(--bg-elevated, var(--border))',
                  color: cap === 'tools' ? '#fff' : 'var(--fg-muted)',
                  borderRadius: 3,
                  padding: '1px 5px',
                  fontWeight: 600,
                }}
              >
                {cap}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Running models */}
      <Section title="In Memory">
        {runningModels.length === 0 ? (
          <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>none loaded</span>
        ) : (
          runningModels.map((m) => (
            <div key={m.name} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {m.name}
              </div>
              <div style={{ fontSize: 9, color: 'var(--fg-subtle)', fontFamily: 'monospace' }}>
                vram {fmtBytes(m.sizeVram)}
                {m.expiresAt && (
                  <> · expires {new Date(m.expiresAt).toLocaleTimeString()}</>
                )}
              </div>
            </div>
          ))
        )}
      </Section>

      {/* Session token history */}
      <Section title="Session Tokens">
        <Row label="output tok" value={totalTokens > 0 ? totalTokens.toLocaleString() : '—'} />
        <Row label="input tok" value={totalPromptTokens > 0 ? totalPromptTokens.toLocaleString() : '—'} />
        {messageStats.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {messageStats.slice(-8).map((s) => {
              const tps = s.stats.tokensPerSec;
              return (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 9,
                    color: 'var(--fg-subtle)',
                    fontFamily: 'monospace',
                    marginBottom: 2,
                  }}
                >
                  <span>{s.stats.evalCount ?? 0} tok</span>
                  <span>{tps != null ? `${tps.toFixed(0)} t/s` : '—'}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
