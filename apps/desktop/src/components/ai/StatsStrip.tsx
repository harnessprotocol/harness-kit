import type { TurnStats } from '../../hooks/useAIChat';
import type { RunningModel, ModelDetails } from '../../lib/tauri';

interface Props {
  model: string;
  modelInfo: { size: number | null } | null;
  modelDetails: ModelDetails | null;
  runningModels: RunningModel[];
  lastTurnStats: TurnStats | null;
  conversationTokens: number;
}

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(0)} MB`;
  return `${(n / 1_024).toFixed(0)} KB`;
}

const SEP = <span style={{ color: 'var(--border)', margin: '0 5px' }}>·</span>;

export function StatsStrip({ model, modelInfo, modelDetails, runningModels, lastTurnStats, conversationTokens }: Props) {
  const running = runningModels.find((m) => m.name === model || m.name.startsWith(model.split(':')[0]));
  const vram = running?.sizeVram;
  const ctxLen = modelDetails?.contextLength;
  const modelSize = modelInfo?.size;
  const tps = lastTurnStats?.tokensPerSec;
  const totalMs = lastTurnStats?.totalDurationNs != null ? lastTurnStats.totalDurationNs / 1_000_000 : null;

  const cellStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--fg-muted)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    whiteSpace: 'nowrap',
  };

  const labelStyle: React.CSSProperties = {
    ...cellStyle,
    color: 'var(--fg-subtle)',
    marginRight: 3,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: '3px 14px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
        flexWrap: 'wrap',
        rowGap: 2,
      }}
    >
      {/* Model */}
      <span style={labelStyle}>model</span>
      <span style={cellStyle}>{model || '—'}</span>
      {SEP}

      {/* Context window */}
      <span style={labelStyle}>ctx</span>
      <span style={cellStyle}>{ctxLen != null ? ctxLen.toLocaleString() : '—'}</span>
      {SEP}

      {/* Model size on disk */}
      <span style={labelStyle}>size</span>
      <span style={cellStyle}>{fmtBytes(modelSize)}</span>
      {SEP}

      {/* VRAM */}
      <span style={labelStyle}>vram</span>
      <span style={cellStyle}>{vram != null ? fmtBytes(vram) : '—'}</span>
      {SEP}

      {/* Conversation tokens */}
      <span style={labelStyle}>tokens</span>
      <span style={cellStyle}>{conversationTokens > 0 ? conversationTokens.toLocaleString() : '—'}</span>
      {SEP}

      {/* Last-turn tokens/sec */}
      <span style={labelStyle}>tps</span>
      <span style={cellStyle}>{tps != null ? `${tps.toFixed(0)} tok/s` : '—'}</span>
      {SEP}

      {/* Last-turn total latency */}
      <span style={labelStyle}>last</span>
      <span style={cellStyle}>{totalMs != null ? `${(totalMs / 1000).toFixed(1)}s` : '—'}</span>
    </div>
  );
}
