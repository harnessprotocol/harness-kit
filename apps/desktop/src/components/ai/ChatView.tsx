import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatBubble, StreamingChatBubble } from './ChatBubble';
import { ModelSelector } from './ModelSelector';
import { OllamaStatus } from './OllamaStatus';
import type { OllamaState } from '../../hooks/useOllama';
import type { UseAIChatReturn } from '../../hooks/useAIChat';

interface Props {
  chat: UseAIChatReturn;
  ollama: OllamaState;
  selectedModel: string;
  onModelSelect: (model: string) => void;
}

export function ChatView({ chat, ollama, selectedModel, onModelSelect }: Props) {
  const { messages, streamingContent, isStreaming, error, sendMessage, cancelStream } = chat;
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages or streaming content change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || isStreaming || !ollama.running) return;
    if (!selectedModel) return;
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage(content, selectedModel);
  }, [input, isStreaming, ollama.running, selectedModel, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const canSend = input.trim().length > 0 && !isStreaming && ollama.running && !!selectedModel;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      {/* Header bar */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 16px',
          borderBottom: '1px solid var(--separator)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, maxWidth: 260 }}>
          <ModelSelector
            models={ollama.models}
            selectedModel={selectedModel}
            onSelect={onModelSelect}
            pullModel={ollama.pullModel}
          />
        </div>
        <OllamaStatus ollama={ollama} />
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            flexShrink: 0,
            padding: '7px 16px',
            background: 'rgba(239,68,68,0.08)',
            borderBottom: '1px solid rgba(239,68,68,0.2)',
            fontSize: 12,
            color: 'var(--danger, #ef4444)',
          }}
        >
          {error}
        </div>
      )}

      {/* Messages list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {messages.length === 0 && !isStreaming && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontSize: 13,
              color: 'var(--fg-subtle)',
            }}
          >
            {ollama.running ? 'Send a message to start the conversation.' : 'Waiting for Ollama…'}
          </div>
        )}

        {messages.map(msg => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {isStreaming && streamingContent && (
          <StreamingChatBubble content={streamingContent} />
        )}

        {isStreaming && !streamingContent && (
          <div style={{ padding: '10px 16px', display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Thinking</span>
            <span className="thinking-dots" aria-hidden="true" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          flexShrink: 0,
          padding: '10px 16px 14px',
          borderTop: '1px solid var(--separator)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); resizeTextarea(); }}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || !ollama.running}
            placeholder={
              !ollama.running
                ? 'Ollama is not running…'
                : isStreaming
                  ? 'Waiting for response…'
                  : 'Message (Enter to send, Shift+Enter for newline)'
            }
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              padding: '8px 12px',
              fontSize: 13,
              lineHeight: 1.5,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 7,
              color: 'var(--fg-base)',
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s',
              minHeight: 36,
              maxHeight: 160,
              overflowY: 'auto',
              opacity: (!ollama.running || isStreaming) ? 0.6 : 1,
            }}
            onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
            onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          />

          {isStreaming ? (
            <button
              onClick={cancelStream}
              style={{
                padding: '7px 14px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                fontSize: 12,
                color: 'var(--danger, #ef4444)',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              style={{
                padding: '7px 14px',
                background: canSend ? 'var(--accent)' : 'var(--bg-surface)',
                border: canSend ? 'none' : '1px solid var(--border)',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                color: canSend ? '#fff' : 'var(--fg-subtle)',
                cursor: canSend ? 'pointer' : 'not-allowed',
                flexShrink: 0,
                transition: 'opacity 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { if (canSend) (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
