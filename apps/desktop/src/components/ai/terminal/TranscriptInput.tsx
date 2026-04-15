import { useRef, useCallback, useEffect } from 'react';

interface Props {
  onSend: (content: string) => void;
  isStreaming: boolean;
  onCancel: () => void;
  disabled?: boolean;
}

export function TranscriptInput({ onSend, isStreaming, onCancel, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastPromptRef = useRef('');

  // Auto-resize textarea
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, []);

  useEffect(() => {
    resize();
  }, [resize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const value = el.value.trim();
      if (value && !isStreaming && !disabled) {
        lastPromptRef.current = value;
        onSend(value);
        el.value = '';
        resize();
      }
      return;
    }

    // ↑ in empty input = recall last prompt
    if (e.key === 'ArrowUp' && el.value === '') {
      e.preventDefault();
      if (lastPromptRef.current) {
        el.value = lastPromptRef.current;
        resize();
        // Move cursor to end
        setTimeout(() => {
          el.selectionStart = el.selectionEnd = el.value.length;
        }, 0);
      }
      return;
    }

    // Esc / Ctrl+C = cancel stream
    if ((e.key === 'Escape' || (e.ctrlKey && e.key === 'c')) && isStreaming) {
      e.preventDefault();
      onCancel();
    }
  };

  const handleInput = () => resize();

  const handleSendClick = () => {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value.trim();
    if (value && !isStreaming && !disabled) {
      lastPromptRef.current = value;
      onSend(value);
      el.value = '';
      resize();
    }
  };

  const canSend = !isStreaming && !disabled;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        padding: '8px 14px 12px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: 'var(--accent)',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 13,
          paddingBottom: 6,
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        &gt;
      </span>
      <textarea
        ref={textareaRef}
        rows={1}
        placeholder={isStreaming ? '' : 'Message… (Enter to send, Shift+Enter for newline)'}
        disabled={isStreaming || disabled}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        style={{
          flex: 1,
          resize: 'none',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 13,
          color: 'var(--fg-base)',
          lineHeight: 1.6,
          minHeight: 36,
          maxHeight: 160,
          paddingTop: 6,
          paddingBottom: 6,
          overflowY: 'auto',
        }}
      />
      {isStreaming ? (
        <button
          onClick={onCancel}
          title="Cancel stream (Esc)"
          style={{
            background: 'none',
            border: '1px solid var(--danger, #dc2626)',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 11,
            color: 'var(--danger, #dc2626)',
            cursor: 'pointer',
            flexShrink: 0,
            marginBottom: 4,
          }}
        >
          stop
        </button>
      ) : (
        <button
          onClick={handleSendClick}
          disabled={!canSend}
          title="Send (Enter)"
          style={{
            background: canSend ? 'var(--accent)' : 'var(--border)',
            border: 'none',
            borderRadius: 4,
            padding: '4px 12px',
            fontSize: 11,
            color: canSend ? '#fff' : 'var(--fg-subtle)',
            cursor: canSend ? 'pointer' : 'default',
            flexShrink: 0,
            marginBottom: 4,
            transition: 'background 0.1s',
          }}
        >
          send
        </button>
      )}
    </div>
  );
}
