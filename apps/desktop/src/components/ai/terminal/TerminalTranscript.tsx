import { useRef, useEffect, useState } from 'react';
import type { TranscriptRow } from '../../../hooks/useAIChat';
import { UserPromptRow } from './UserPromptRow';
import { AssistantRow } from './AssistantRow';
import { ThinkingRow } from './ThinkingRow';
import { SystemRow } from './SystemRow';
import { ErrorRow } from './ErrorRow';
import { ToolCallRow } from './ToolCallRow';
import { ToolResultRow } from './ToolResultRow';
import { WriteApprovalRow } from './WriteApprovalRow';

interface Props {
  transcript: TranscriptRow[];
  isStreaming: boolean;
  onApprove?: (rowId: string) => void;
  onDeny?: (rowId: string) => void;
}

const AUTO_SCROLL_THRESHOLD = 32; // px from bottom

export function TerminalTranscript({ transcript, isStreaming, onApprove, onDeny }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showChip, setShowChip] = useState(false);

  // Auto-scroll: scroll if within threshold of bottom; otherwise show chip
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom <= AUTO_SCROLL_THRESHOLD) {
      el.scrollTop = el.scrollHeight;
      setShowChip(false);
    } else {
      setShowChip(true);
    }
  }, [transcript]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setShowChip(false);
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom <= AUTO_SCROLL_THRESHOLD) setShowChip(false);
  };

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {transcript.length === 0 && !isStreaming && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--fg-subtle)', fontSize: 13, fontFamily: 'monospace' }}>
              # type a message to start
            </span>
          </div>
        )}
        {transcript.map((row) => {
          switch (row.kind) {
            case 'user':
              return <UserPromptRow key={row.id} content={row.content} />;
            case 'assistant':
              return (
                <AssistantRow
                  key={row.id}
                  content={row.content}
                  streaming={row.streaming}
                  incomplete={row.incomplete}
                  stats={row.stats}
                />
              );
            case 'thinking':
              return <ThinkingRow key={row.id} />;
            case 'system':
              return <SystemRow key={row.id} content={row.content} />;
            case 'error':
              return <ErrorRow key={row.id} content={row.content} />;
            case 'tool_call':
              return (
                <ToolCallRow key={row.id} toolName={row.toolName} args={row.args} />
              );
            case 'tool_result':
              return (
                <ToolResultRow
                  key={row.id}
                  toolName={row.toolName}
                  ok={row.ok}
                  content={row.content}
                />
              );
            case 'write_approval':
              return (
                <WriteApprovalRow
                  key={row.id}
                  rowId={row.id}
                  toolName={row.toolName}
                  summary={row.summary}
                  onApprove={onApprove ?? (() => {})}
                  onDeny={onDeny ?? (() => {})}
                />
              );
          }
        })}
      </div>

      {showChip && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute',
            bottom: 10,
            right: 16,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '4px 10px',
            fontSize: 11,
            color: 'var(--accent)',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ▾ new output
        </button>
      )}
    </div>
  );
}
