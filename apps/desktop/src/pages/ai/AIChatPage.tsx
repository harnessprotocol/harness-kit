import { useState, useEffect, useCallback, useRef } from 'react';
import { useOllama } from '../../hooks/useOllama';
import { useAIChat } from '../../hooks/useAIChat';
import { TranscriptToolbar } from '../../components/ai/terminal/TranscriptToolbar';
import { TerminalTranscript } from '../../components/ai/terminal/TerminalTranscript';
import { TranscriptInput } from '../../components/ai/terminal/TranscriptInput';
import { SessionList } from '../../components/ai/SessionList';
import { StatsStrip } from '../../components/ai/StatsStrip';
import { InspectorPanel } from '../../components/ai/InspectorPanel';
import { SystemPromptPanel } from '../../components/ai/SystemPromptPanel';
import { aiGetConfig } from '../../lib/tauri';
import type { TurnStats } from '../../hooks/useAIChat';

export default function AIChatPage() {
  const ollama = useOllama();
  const chat = useAIChat();
  const [selectedModel, setSelectedModel] = useState('');
  const [mode, setMode] = useState<'styled' | 'raw'>('styled');
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [systemPrompt, setSystemPrompt] = useState<string | undefined>(undefined);
  const [pullStatus, setPullStatus] = useState<{ model: string; percent: number } | null>(null);

  // Load runtime base URL once
  useEffect(() => {
    aiGetConfig().then((cfg) => setBaseUrl(cfg.baseUrl)).catch(() => {});
  }, []);

  // Seed the model selector once models load
  useEffect(() => {
    if (ollama.models.length > 0 && !selectedModel) {
      const saved = localStorage.getItem('ai-chat:last-model');
      setSelectedModel(saved && ollama.models.some((m) => m.name === saved)
        ? saved
        : ollama.models[0].name
      );
    }
  }, [ollama.models, selectedModel]);

  // Fetch model details when selection changes
  useEffect(() => {
    if (selectedModel && ollama.running) {
      ollama.fetchModelDetails(selectedModel).catch(() => {});
    }
  }, [selectedModel, ollama.running]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist selected model
  const handleModelSelect = useCallback((model: string) => {
    setSelectedModel(model);
    localStorage.setItem('ai-chat:last-model', model);
  }, []);

  const getModel = useCallback(() => {
    return selectedModel || ollama.models[0]?.name || '';
  }, [selectedModel, ollama.models]);

  const handleNewChat = useCallback(async () => {
    const model = getModel();
    if (!model || !ollama.running) return;
    await chat.createSession(model);
  }, [chat, getModel, ollama.running]);

  const modelDetails = ollama.modelDetails[selectedModel] ?? null;

  const handlePromptChange = useCallback((p: string) => setSystemPrompt(p || undefined), []);

  const handleSend = useCallback(async (content: string) => {
    const model = getModel();
    if (!model) return;
    await chat.sendMessage(content, model, systemPrompt, modelDetails);
  }, [chat, getModel, systemPrompt, modelDetails]);

  const handleSelectSession = useCallback(async (id: string) => {
    await chat.loadSession(id);
    setSessionPickerOpen(false);
  }, [chat]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'n') {
        e.preventDefault();
        handleNewChat();
      } else if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        setSessionPickerOpen((o) => !o);
      } else if (e.metaKey && e.key === 'l') {
        e.preventDefault();
        handleNewChat();
      } else if (e.key === 'Escape' && sessionPickerOpen) {
        setSessionPickerOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNewChat, sessionPickerOpen]);

  // xterm raw mode: maintain a chunks array + tick for the terminal view
  const rawChunksRef = useRef<string[]>([]);
  const [rawTick, setRawTick] = useState(0);

  // When transcript changes, append new text to rawChunks for the xterm view
  const prevTranscriptLenRef = useRef(0);
  useEffect(() => {
    const current = chat.transcript;
    if (current.length > prevTranscriptLenRef.current) {
      for (let i = prevTranscriptLenRef.current; i < current.length; i++) {
        const row = current[i];
        if (row.kind === 'user') {
          rawChunksRef.current.push(`\x1b[36m> ${row.content}\x1b[0m\r\n`);
        } else if (row.kind === 'assistant') {
          rawChunksRef.current.push(`${row.content}\r\n`);
        } else if (row.kind === 'system') {
          rawChunksRef.current.push(`\x1b[90m# ${row.content}\x1b[0m\r\n`);
        } else if (row.kind === 'error') {
          rawChunksRef.current.push(`\x1b[31m! ${row.content}\x1b[0m\r\n`);
        }
      }
      setRawTick((t) => t + 1);
    }
    prevTranscriptLenRef.current = current.length;
  }, [chat.transcript]);

  // Derive per-message stats list for InspectorPanel
  const messageStats: { id: string; stats: TurnStats }[] = chat.transcript
    .filter((r) => r.kind === 'assistant' && r.stats != null)
    .map((r) => ({ id: r.id, stats: (r as Extract<typeof r, { kind: 'assistant' }>).stats! }));

  // Cumulative conversation token count for StatsStrip
  const conversationTokens = messageStats.reduce((s, m) => s + (m.stats.evalCount ?? 0), 0);

  const modelInfo = ollama.models.find((m) => m.name === selectedModel) ?? null;

  // Compute why the input is disabled (if at all)
  const inputDisabled = !ollama.running || !selectedModel;
  const disabledReason = (() => {
    if (ollama.timedOut) return 'Could not connect to Ollama';
    if (ollama.checking) return 'Checking for Ollama…';
    if (!ollama.running) return 'Ollama is not running';
    if (ollama.models.length === 0) return 'No models available — pull one below';
    if (!selectedModel) return 'Select a model to start';
    return undefined;
  })();

  const handlePullModel = useCallback(async (model: string) => {
    try {
      setPullStatus({ model, percent: 0 });
      await ollama.pullModel(model, (p) => {
        if (p.total && p.total > 0) {
          setPullStatus({ model, percent: Math.round(((p.completed ?? 0) / p.total) * 100) });
        }
      });
      setPullStatus(null);
    } catch (e) {
      setPullStatus(null);
      console.error('[ai-chat] pull failed:', e);
    }
  }, [ollama]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Toolbar */}
      <TranscriptToolbar
        ollama={ollama}
        selectedModel={selectedModel}
        onModelSelect={handleModelSelect}
        onNew={handleNewChat}
        baseUrl={baseUrl}
        version={ollama.version}
        runningCount={ollama.runningModels.length}
        isStreaming={chat.isStreaming}
        onCancelStream={chat.cancelStream}
        mode={mode}
        onToggleMode={() => setMode((m) => m === 'styled' ? 'raw' : 'styled')}
        modelDetails={modelDetails}
        currentToolHop={chat.currentToolHop}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((o) => !o)}
      />

      {/* Status notice */}
      {!ollama.running && ollama.timedOut && (
        <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          Could not connect to Ollama. Check that it&rsquo;s running on {baseUrl}.
          <button
            onClick={ollama.retry}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 10px', fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}
      {!ollama.running && !ollama.timedOut && ollama.checking && (
        <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-muted)' }}>
          Checking for Ollama…
        </div>
      )}
      {!ollama.running && !ollama.timedOut && !ollama.checking && (
        <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-muted)' }}>
          Ollama is not running.{' '}
          <a href="https://ollama.ai" target="_blank" rel="noopener" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
            Install Ollama
          </a>{' '}
          to use AI Chat.
        </div>
      )}
      {ollama.running && ollama.models.length === 0 && (
        <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-muted)' }}>
          Ollama is running but no models are installed.{' '}
          {pullStatus ? (
            <span style={{ color: 'var(--accent)' }}>
              Pulling {pullStatus.model}… {pullStatus.percent}%
            </span>
          ) : (
            <button
              onClick={() => handlePullModel('llama3.2')}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 10px', fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}
            >
              Pull llama3.2
            </button>
          )}
        </div>
      )}

      {/* Main content row: transcript + optional inspector */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Transcript area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* System prompt panel — above transcript */}
          <SystemPromptPanel
            sessionId={chat.currentSession?.id ?? null}
            onPromptChange={handlePromptChange}
          />

          {mode === 'styled' ? (
            <TerminalTranscript
              transcript={chat.transcript}
              isStreaming={chat.isStreaming}
              onApprove={(rowId) => chat.resolveApproval(rowId, true)}
              onDeny={(rowId) => chat.resolveApproval(rowId, false)}
            />
          ) : (
            <RawView chunks={rawChunksRef.current} outputTick={rawTick} />
          )}

          {/* Stats strip */}
          <StatsStrip
            model={selectedModel}
            modelInfo={modelInfo}
            modelDetails={modelDetails}
            runningModels={ollama.runningModels}
            lastTurnStats={chat.lastTurnStats}
            conversationTokens={conversationTokens}
          />

          {/* Input */}
          <TranscriptInput
            onSend={handleSend}
            isStreaming={chat.isStreaming}
            onCancel={chat.cancelStream}
            disabled={inputDisabled}
            disabledReason={disabledReason}
          />
        </div>

        {/* Inspector panel */}
        {inspectorOpen && (
          <InspectorPanel
            model={selectedModel}
            modelDetails={modelDetails}
            runningModels={ollama.runningModels}
            messageStats={messageStats}
          />
        )}
      </div>

      {/* Session picker overlay (Cmd+K) */}
      {sessionPickerOpen && (
        <SessionPickerOverlay
          sessions={chat.sessions}
          currentSessionId={chat.currentSession?.id ?? null}
          ollamaRunning={ollama.running}
          onSelect={handleSelectSession}
          onNew={async () => { await handleNewChat(); setSessionPickerOpen(false); }}
          onDelete={chat.deleteSession}
          onRename={chat.renameSession}
          onClose={() => setSessionPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Lazy-import ChatTerminalView to avoid loading xterm on every page ─────────

function RawView({ chunks, outputTick }: { chunks: string[]; outputTick: number }) {
  const [ChatTerminalView, setChatTerminalView] = useState<React.ComponentType<{ chunks: string[]; outputTick: number }> | null>(null);

  useEffect(() => {
    import('../../components/ai/terminal/ChatTerminalView').then((mod) => {
      setChatTerminalView(() => mod.default);
    });
  }, []);

  if (!ChatTerminalView) return (
    <div style={{ flex: 1, background: '#0b0d12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#888', fontSize: 12 }}>Loading terminal…</span>
    </div>
  );

  return <ChatTerminalView chunks={chunks} outputTick={outputTick} />;
}

// ── Session picker overlay ────────────────────────────────────────────────────

interface SessionPickerProps {
  sessions: ReturnType<typeof useAIChat>['sessions'];
  currentSessionId: string | null;
  ollamaRunning: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>;
  onClose: () => void;
}

function SessionPickerOverlay({
  sessions,
  currentSessionId,
  ollamaRunning,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onClose,
}: SessionPickerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 60,
        zIndex: 100,
      }}
    >
      <div
        ref={overlayRef}
        style={{
          width: 400,
          maxHeight: 480,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Sessions (Cmd+K)</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', fontSize: 14, padding: '0 4px' }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SessionList
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelect={onSelect}
            onNew={onNew}
            onDelete={onDelete}
            onRename={onRename}
            ollamaRunning={ollamaRunning}
          />
        </div>
      </div>
    </div>
  );
}
