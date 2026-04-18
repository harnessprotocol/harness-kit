import { OllamaStatus } from '../OllamaStatus';
import type { OllamaState } from '../../../hooks/useOllama';
import type { ModelDetails } from '../../../lib/tauri';

interface Props {
  ollama: Pick<OllamaState, 'running' | 'checking' | 'timedOut' | 'retry' | 'models'>;
  selectedModel: string;
  onModelSelect: (model: string) => void;
  onNew: () => void;
  baseUrl?: string;
  version?: string | null;
  runningCount?: number;
  isStreaming?: boolean;
  onCancelStream?: () => void;
  mode: 'styled' | 'raw';
  onToggleMode: () => void;
  modelDetails?: ModelDetails | null;
  currentToolHop?: number;
  inspectorOpen?: boolean;
  onToggleInspector?: () => void;
}

export function TranscriptToolbar({
  ollama,
  selectedModel,
  onModelSelect,
  onNew,
  baseUrl,
  version,
  runningCount,
  isStreaming,
  onCancelStream,
  mode,
  onToggleMode,
  modelDetails,
  currentToolHop,
  inspectorOpen,
  onToggleInspector,
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

  const hasTools = modelDetails?.capabilities?.includes('tools') ?? false;
  const noToolsKnown = modelDetails != null && !hasTools;

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

        {/* Tool-capability pill — shown once modelDetails is loaded */}
        {hasTools && (
          <span
            title={`Capabilities: ${modelDetails!.capabilities.join(', ')}`}
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
        {noToolsKnown && (
          <span
            title={`Capabilities: ${modelDetails!.capabilities.join(', ') || 'none reported'}`}
            style={{
              fontSize: 9,
              background: 'var(--border)',
              color: 'var(--fg-subtle)',
              borderRadius: 3,
              padding: '1px 4px',
              letterSpacing: '0.03em',
              fontWeight: 600,
            }}
          >
            no tools
          </span>
        )}

        {/* Tool-hop counter — visible during active multi-turn loop */}
        {isStreaming && currentToolHop != null && currentToolHop > 0 && (
          <span
            title={`Tool hop ${currentToolHop} of 6`}
            style={{
              fontSize: 9,
              background: 'var(--bg-elevated, #1e2030)',
              border: '1px solid var(--border)',
              color: 'var(--fg-muted)',
              borderRadius: 3,
              padding: '1px 5px',
              fontFamily: 'monospace',
            }}
          >
            hop {currentToolHop}
          </span>
        )}
      </div>

      {/* Status + cancel */}
      <OllamaStatus
        ollama={ollama}
        baseUrl={baseUrl}
        version={version}
        runningCount={runningCount}
        isStreaming={isStreaming}
        onCancelStream={onCancelStream}
      />

      <div style={{ flex: 1 }} />

      {/* Inspector toggle */}
      {onToggleInspector && (
        <button
          style={{
            ...btnStyle,
            borderColor: inspectorOpen ? 'var(--accent)' : 'var(--border)',
            color: inspectorOpen ? 'var(--accent)' : 'var(--fg-muted)',
          }}
          onClick={onToggleInspector}
          title="Toggle inspector panel"
        >
          ⌥ inspect
        </button>
      )}

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
