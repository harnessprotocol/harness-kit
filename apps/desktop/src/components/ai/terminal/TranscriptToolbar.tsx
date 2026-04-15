import { OllamaStatus } from '../OllamaStatus';
import type { OllamaState } from '../../../hooks/useOllama';

// Models that support tool-calling via Ollama
const TOOL_CAPABLE_PREFIXES = [
  'qwen3', 'qwen2.5', 'llama3.1', 'llama3.2',
  'mistral-nemo', 'command-r-plus', 'command-r',
];

function modelSupportsTools(name: string): boolean {
  const lower = name.toLowerCase();
  return TOOL_CAPABLE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

interface Props {
  ollama: Pick<OllamaState, 'running' | 'checking' | 'timedOut' | 'retry' | 'models'>;
  selectedModel: string;
  onModelSelect: (model: string) => void;
  onNew: () => void;
  baseUrl?: string;
  isStreaming?: boolean;
  onCancelStream?: () => void;
  mode: 'styled' | 'raw';
  onToggleMode: () => void;
}

export function TranscriptToolbar({
  ollama,
  selectedModel,
  onModelSelect,
  onNew,
  baseUrl,
  isStreaming,
  onCancelStream,
  mode,
  onToggleMode,
}: Props) {
  const btnStyle: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '3px 9px',
    fontSize: 11,
    color: 'var(--fg-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      {/* Model picker */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
        <select
          value={selectedModel}
          onChange={(e) => onModelSelect(e.target.value)}
          disabled={!ollama.running || ollama.models.length === 0}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '3px 24px 3px 8px',
            fontSize: 11,
            color: 'var(--fg-base)',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
            maxWidth: 180,
          }}
        >
          {ollama.models.length === 0 ? (
            <option value="">No models</option>
          ) : (
            ollama.models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))
          )}
        </select>
        {selectedModel && modelSupportsTools(selectedModel) && (
          <span
            title="Supports tool-calling"
            style={{
              fontSize: 9,
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: 3,
              padding: '1px 4px',
              letterSpacing: '0.03em',
              fontWeight: 600,
            }}
          >
            tools
          </span>
        )}
      </div>

      {/* Status + cancel */}
      <OllamaStatus
        ollama={ollama}
        baseUrl={baseUrl}
        isStreaming={isStreaming}
        onCancelStream={onCancelStream}
      />

      <div style={{ flex: 1 }} />

      {/* Mode toggle */}
      <button
        style={btnStyle}
        onClick={onToggleMode}
        title={mode === 'styled' ? 'Switch to raw xterm view' : 'Switch to styled view'}
      >
        {mode === 'styled' ? '⊞ raw' : '⊟ styled'}
      </button>

      {/* New chat */}
      <button
        style={{ ...btnStyle, borderColor: 'var(--accent)', color: 'var(--accent)' }}
        onClick={onNew}
        disabled={!ollama.running}
        title="New chat (Cmd+N)"
      >
        + new
      </button>
    </div>
  );
}
