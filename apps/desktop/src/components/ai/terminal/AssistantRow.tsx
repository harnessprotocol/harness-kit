import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TurnStats } from '../../../hooks/useAIChat';

interface Props {
  content: string;
  streaming?: boolean;
  incomplete?: boolean;
  stats?: TurnStats;
}

export function AssistantRow({ content, streaming, incomplete, stats }: Props) {
  const showStats = !streaming && stats && (stats.evalCount != null || stats.tokensPerSec != null);

  return (
    <div
      style={{
        padding: '6px 0 6px 16px',
        borderLeft: '2px solid var(--border)',
        marginLeft: 0,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.7,
        color: 'var(--fg-base)',
      }}
    >
      <div className="ai-assistant-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        {streaming && <span className="streaming-cursor" />}
        {incomplete && !streaming && (
          <span style={{ fontSize: 10, color: 'var(--fg-subtle)', marginLeft: 4 }}>
            [incomplete]
          </span>
        )}
      </div>
      {showStats && (
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            color: 'var(--fg-subtle)',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            display: 'flex',
            gap: 6,
          }}
        >
          {stats!.evalCount != null && (
            <span>{stats!.evalCount.toLocaleString()} tok</span>
          )}
          {stats!.totalDurationNs != null && (
            <span>{(stats!.totalDurationNs / 1_000_000_000).toFixed(2)}s</span>
          )}
          {stats!.tokensPerSec != null && (
            <span>{stats!.tokensPerSec.toFixed(0)} tok/s</span>
          )}
        </div>
      )}
    </div>
  );
}
