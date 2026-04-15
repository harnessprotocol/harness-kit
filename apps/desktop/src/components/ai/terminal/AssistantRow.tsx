import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  streaming?: boolean;
  incomplete?: boolean;
}

export function AssistantRow({ content, streaming, incomplete }: Props) {
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
    </div>
  );
}
