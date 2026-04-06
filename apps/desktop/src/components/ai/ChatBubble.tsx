import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIChatMessageDisplay } from '../../hooks/useAIChat';

interface Props {
  message: AIChatMessageDisplay;
}

export function ChatBubble({ message }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  }, [message.content]);

  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '10px 16px',
        borderBottom: '1px solid var(--separator)',
        position: 'relative',
      }}
      className="chat-bubble-row"
    >
      {/* Role label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: isUser ? 'var(--accent)' : 'var(--fg-subtle)',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
          }}
        >
          {isUser ? 'You' : 'Assistant'}
        </span>
        <button
          onClick={copy}
          title="Copy"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 11,
            color: 'var(--fg-subtle)',
            transition: 'color 0.15s, background 0.15s',
            opacity: 0,
          }}
          className="chat-bubble-copy"
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--fg-base)';
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--fg-subtle)';
            (e.currentTarget as HTMLElement).style.background = 'none';
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Content */}
      {isUser ? (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--fg-base)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>
      ) : (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/** Streaming assistant bubble — shows content as it arrives with cursor */
interface StreamingBubbleProps {
  content: string;
}

export function StreamingChatBubble({ content }: StreamingBubbleProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '10px 16px',
        borderBottom: '1px solid var(--separator)',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--fg-subtle)',
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
        }}
      >
        Assistant
      </span>
      <div className="markdown-body" style={{ position: 'relative' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
        <span className="streaming-cursor" aria-hidden="true" />
      </div>
    </div>
  );
}
