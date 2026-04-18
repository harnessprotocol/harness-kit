import { useState, useCallback, useRef, useEffect } from "react";
import { Channel } from "@tauri-apps/api/core";
import {
  aiCreateSession,
  aiUpdateSessionTitle,
  aiDeleteSession,
  aiListSessions,
  aiLoadSession,
  aiSaveMessage,
  aiStreamChat,
  aiCancelStream,
  type AIChatMessage,
  type AISessionRow,
  type AIMessageRow,
  type StreamEvent,
  type ToolCall,
} from "../lib/tauri";
import { logAIError } from "./ai/logging";
import { dispatchToolCall } from "./ai/dispatch";
import { TOOLS, SYSTEM_PROMPT, modelSupportsTools } from "./ai/toolRegistry";
import { toolsForOllama, type ToolDef } from "./ai/toolTypes";
import type { ModelDetails } from "../lib/tauri";
import { useApprovalState } from "./ai/approvalState";

// ─── Transcript types ────────────────────────────────────────────────────────

export interface TurnStats {
  evalCount?: number;
  promptEvalCount?: number;
  totalDurationNs?: number;
  loadDurationNs?: number;
  promptEvalDurationNs?: number;
  evalDurationNs?: number;
  tokensPerSec?: number;
}

export type TranscriptRow =
  | { kind: "user"; id: string; content: string; ts: string }
  | {
      kind: "assistant";
      id: string;
      content: string;
      ts: string;
      streaming?: boolean;
      incomplete?: boolean;
      stats?: TurnStats;
    }
  | { kind: "thinking"; id: string }
  | { kind: "system"; id: string; content: string }
  | { kind: "error"; id: string; content: string }
  | { kind: "tool_call"; id: string; toolName: string; args: unknown }
  | {
      kind: "tool_result";
      id: string;
      toolName: string;
      ok: boolean;
      content: unknown;
    }
  | {
      kind: "write_approval";
      id: string;
      toolName: string;
      summary: string;
      callRowId: string;
    };

// ─── Public interface ────────────────────────────────────────────────────────

export interface UseAIChatReturn {
  sessions: AISessionRow[];
  currentSession: AISessionRow | null;
  /** Ordered list of rows to render in the transcript */
  transcript: TranscriptRow[];
  isStreaming: boolean;
  /** Stats from the most recent completed turn */
  lastTurnStats: TurnStats | null;
  /** Current tool-hop index during an active multi-turn loop (0 when not in a loop) */
  currentToolHop: number;
  error: string | null;
  sendMessage: (content: string, model: string, systemPrompt?: string, modelDetails?: ModelDetails | null) => Promise<void>;
  cancelStream: () => void;
  createSession: (model: string) => Promise<string>;
  loadSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  /** Resolve a pending write-approval prompt */
  resolveApproval: (rowId: string, approved: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRow(role: string, id: string, content: string, ts: string): TranscriptRow {
  switch (role) {
    case "user":
      return { kind: "user", id, content, ts };
    case "assistant":
      return { kind: "assistant", id, content, ts };
    case "system":
      return { kind: "system", id, content };
    case "error":
      return { kind: "error", id, content };
    default:
      return { kind: "system", id, content: `[${role}] ${content}` };
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const MAX_TOOL_HOPS = 6;

export function useAIChat(): UseAIChatReturn {
  const [sessions, setSessions] = useState<AISessionRow[]>([]);
  const [currentSession, setCurrentSession] = useState<AISessionRow | null>(null);
  const [transcript, setTranscript] = useState<TranscriptRow[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastTurnStats, setLastTurnStats] = useState<TurnStats | null>(null);
  const [currentToolHop, setCurrentToolHop] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs for use inside async callbacks / Channel.onmessage
  const currentSessionRef = useRef<AISessionRow | null>(null);
  const transcriptRef = useRef<TranscriptRow[]>([]);
  const mountedRef = useRef(true);
  const approval = useApprovalState();

  // Keep refs in sync with state
  useEffect(() => { currentSessionRef.current = currentSession; }, [currentSession]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Transcript helpers ──────────────────────────────────────────────────

  const appendRow = useCallback((row: TranscriptRow) => {
    setTranscript((prev) => {
      const next = [...prev, row];
      transcriptRef.current = next;
      return next;
    });
  }, []);

  const replaceRow = useCallback((id: string, row: TranscriptRow) => {
    setTranscript((prev) => {
      const next = prev.map((r) => (r.id === id ? row : r));
      transcriptRef.current = next;
      return next;
    });
  }, []);

  const updateAssistantContent = useCallback((id: string, content: string) => {
    setTranscript((prev) => {
      const next = prev.map((r) =>
        r.id === id && r.kind === "assistant"
          ? { ...r, content, streaming: true }
          : r
      );
      transcriptRef.current = next;
      return next;
    });
  }, []);

  // ── Session management ──────────────────────────────────────────────────

  const refreshSessions = useCallback(async () => {
    try {
      const rows = await aiListSessions();
      if (mountedRef.current) setSessions(rows);
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    }
  }, []);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  const createSession = useCallback(async (model: string): Promise<string> => {
    const id = crypto.randomUUID();
    await aiCreateSession(id, model);
    const newSession: AISessionRow = {
      id,
      title: null,
      model,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      systemPrompt: null,
      contextSourcesJson: null,
    };
    if (mountedRef.current) {
      setCurrentSession(newSession);
      currentSessionRef.current = newSession;
      setTranscript([]);
      transcriptRef.current = [];
      setSessions((prev) => [newSession, ...prev]);
    }
    return id;
  }, []);

  const loadSession = useCallback(async (id: string) => {
    try {
      const [session, rows] = await aiLoadSession(id);
      if (!mountedRef.current) return;

      const loaded: TranscriptRow[] = rows.map((r: AIMessageRow) =>
        makeRow(r.role, r.id, r.content, r.timestamp)
      );

      setCurrentSession(session);
      currentSessionRef.current = session;
      setTranscript(loaded);
      transcriptRef.current = loaded;
      setError(null);
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    }
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    await aiDeleteSession(id);
    if (!mountedRef.current) return;

    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionRef.current?.id === id) {
      setCurrentSession(null);
      currentSessionRef.current = null;
      setTranscript([]);
      transcriptRef.current = [];
    }
  }, []);

  const renameSession = useCallback(async (id: string, title: string) => {
    await aiUpdateSessionTitle(id, title);
    if (!mountedRef.current) return;

    const update = (s: AISessionRow) => (s.id === id ? { ...s, title } : s);
    setSessions((prev) => prev.map(update));
    if (currentSessionRef.current?.id === id) {
      setCurrentSession((prev) => (prev ? { ...prev, title } : prev));
    }
  }, []);

  // ── Messaging ───────────────────────────────────────────────────────────

  const cancelStream = useCallback(() => {
    aiCancelStream().catch((e) => logAIError("cancelStream", e));
    approval.resolveAll(false);
  }, [approval]);

  /**
   * Stream a single hop: send messages to Ollama and collect text + tool calls.
   * Returns { assistantText, toolCalls, done }.
   */
  const streamOnce = useCallback(
    (
      model: string,
      messages: AIChatMessage[],
      ollamaTools: ToolDef[] | undefined,
      thinkingId: string,
      assistantId: string,
      existingContent: string
    ) =>
      new Promise<{ assistantText: string; toolCalls: ToolCall[]; done: boolean; stats: TurnStats }>(
        (resolve, reject) => {
          let fullText = existingContent;
          let pendingToolCalls: ToolCall[] = [];
          let started = existingContent.length > 0;
          let finished = false;

          const channel = new Channel<StreamEvent>();
          channel.onmessage = (event: StreamEvent) => {
            if (!mountedRef.current) return;

            if (event.kind === "text") {
              const chunk = event.data.content;
              fullText += chunk;
              if (!started) {
                started = true;
                replaceRow(thinkingId, {
                  kind: "assistant",
                  id: assistantId,
                  content: fullText,
                  ts: new Date().toISOString(),
                  streaming: true,
                });
              } else {
                updateAssistantContent(assistantId, fullText);
              }
            } else if (event.kind === "toolCalls") {
              pendingToolCalls = event.data.calls;
            } else if (event.kind === "done") {
              if (!finished) {
                finished = true;
                const d = event.data;
                const tokensPerSec =
                  d.evalCount && d.evalDuration && d.evalDuration > 0
                    ? d.evalCount / (d.evalDuration / 1e9)
                    : undefined;
                const stats: TurnStats = {
                  evalCount: d.evalCount,
                  promptEvalCount: d.promptEvalCount,
                  totalDurationNs: d.totalDuration,
                  loadDurationNs: d.loadDuration,
                  promptEvalDurationNs: d.promptEvalDuration,
                  evalDurationNs: d.evalDuration,
                  tokensPerSec,
                };
                // Finalize assistant row (with stats attached)
                if (started) {
                  setTranscript((prev) => {
                    const next = prev.map((r) =>
                      r.id === assistantId && r.kind === "assistant"
                        ? { ...r, content: fullText, streaming: false, stats }
                        : r
                    );
                    transcriptRef.current = next;
                    return next;
                  });
                } else {
                  // Remove thinking row — tool call arrived without text
                  setTranscript((prev) => {
                    const next = prev.filter((r) => r.id !== thinkingId);
                    transcriptRef.current = next;
                    return next;
                  });
                }
                resolve({ assistantText: fullText, toolCalls: pendingToolCalls, done: true, stats });
              }
            } else if (event.kind === "warn") {
              appendRow({ kind: "system", id: crypto.randomUUID(), content: `⚠ ${event.data.message}` });
            }
          };

          aiStreamChat(
            model,
            messages,
            channel,
            ollamaTools ? toolsForOllama(ollamaTools) : undefined
          )
            .then(() => {
              if (!finished) {
                // Stream ended without a done event — commit partial
                finished = true;
                if (started && fullText) {
                  setTranscript((prev) => {
                    const next = prev.map((r) =>
                      r.id === assistantId && r.kind === "assistant"
                        ? { ...r, content: fullText, streaming: false, incomplete: true }
                        : r
                    );
                    transcriptRef.current = next;
                    return next;
                  });
                } else {
                  setTranscript((prev) => {
                    const next = prev.filter((r) => r.id !== thinkingId);
                    transcriptRef.current = next;
                    return next;
                  });
                }
                resolve({ assistantText: fullText, toolCalls: [], done: false, stats: {} });
              }
            })
            .catch(reject);
        }
      ),
    [appendRow, replaceRow, updateAssistantContent]
  );

  const sendMessage = useCallback(
    async (content: string, model: string, systemPrompt?: string, modelDetails?: ModelDetails | null) => {
      if (isStreaming) return;

      setError(null);
      setIsStreaming(true);

      const thinkingId = crypto.randomUUID();

      try {
        // Ensure session exists
        let session = currentSessionRef.current;
        if (!session) {
          const id = crypto.randomUUID();
          await aiCreateSession(id, model);
          session = {
            id,
            title: null,
            model,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            systemPrompt: null,
            contextSourcesJson: null,
          };
          if (mountedRef.current) {
            setCurrentSession(session);
            currentSessionRef.current = session;
            setSessions((prev) => [session!, ...prev]);
          }
        }
        const sessionId = session.id;

        // Append user row
        const userMsgId = crypto.randomUUID();
        const userTs = new Date().toISOString();
        appendRow({ kind: "user", id: userMsgId, content, ts: userTs });
        aiSaveMessage(userMsgId, sessionId, "user", content).catch((e) =>
          logAIError("persist user message", e)
        );

        // Append initial thinking row
        appendRow({ kind: "thinking", id: thinkingId });

        // Build conversation history with system prompt
        const useTools = modelSupportsTools(modelDetails);
        const activeSystemPrompt = systemPrompt ?? SYSTEM_PROMPT;
        const systemMsg: AIChatMessage = { role: "system", content: activeSystemPrompt };
        const history: AIChatMessage[] = [
          systemMsg,
          ...transcriptRef.current
            .filter((r): r is Extract<TranscriptRow, { kind: "user" | "assistant" }> =>
              r.kind === "user" || r.kind === "assistant"
            )
            .map((r) => ({ role: r.kind, content: r.content })),
        ];

        const ollamaTools = useTools ? TOOLS : undefined;
        let assistantId = crypto.randomUUID();

        // ── Multi-turn tool loop ───────────────────────────────────────────
        setCurrentToolHop(0);
        for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
          if (hop > 0 && mountedRef.current) setCurrentToolHop(hop);
          const { assistantText, toolCalls, done, stats } = await streamOnce(
            model,
            history,
            ollamaTools,
            hop === 0 ? thinkingId : assistantId + "-thinking", // must match the thinking row appended at end of prev hop
            assistantId,
            ""
          );

          if (mountedRef.current) setLastTurnStats(stats);

          if (assistantText) {
            history.push({ role: "assistant", content: assistantText, tool_calls: toolCalls.length ? toolCalls : undefined });
            const metadataJson = Object.keys(stats).length
              ? JSON.stringify({ model, ...stats })
              : undefined;
            aiSaveMessage(assistantId, sessionId, "assistant", assistantText, metadataJson).catch((e) =>
              logAIError("persist assistant message", e)
            );
          }

          if (!done || !toolCalls.length) {
            // No tool calls — done
            break;
          }

          // Process each tool call.
          // Only push the assistant message here if we didn't already push it above
          // (we push above when assistantText is non-empty, with tool_calls included).
          if (!assistantText) {
            history.push({ role: "assistant", content: "", tool_calls: toolCalls });
          }

          for (const call of toolCalls) {
            const callRowId = crypto.randomUUID();
            const resultRowId = crypto.randomUUID();

            appendRow({
              kind: "tool_call",
              id: callRowId,
              toolName: call.function.name,
              args: call.function.arguments,
            });

            // For write tools, show approval card before dispatching
            const tool = TOOLS.find((t) => t.name === call.function.name);
            let approvalRowId: string | null = null;
            if (tool?.category === "write") {
              approvalRowId = crypto.randomUUID();
              appendRow({
                kind: "write_approval",
                id: approvalRowId,
                toolName: call.function.name,
                summary: tool.describe(call.function.arguments),
                callRowId,
              });
            }

            const result = await dispatchToolCall(call, TOOLS, {
              rowId: approvalRowId ?? callRowId,
              approval,
            });

            // Remove approval card from transcript
            if (approvalRowId) {
              setTranscript((prev) => {
                const next = prev.filter((r) => r.id !== approvalRowId);
                transcriptRef.current = next;
                return next;
              });
            }

            appendRow({
              kind: "tool_result",
              id: resultRowId,
              toolName: call.function.name,
              ok: result.ok,
              content: result.content,
            });

            // Append denied/result system row
            if (!result.ok) {
              const errContent = (result.content as { error?: string })?.error ?? String(result.content);
              if (errContent === "user denied") {
                appendRow({ kind: "system", id: crypto.randomUUID(), content: `denied ${call.function.name}` });
              }
            }

            history.push({
              role: "tool",
              content: JSON.stringify(result.content),
              name: call.function.name,
            });
          }

          // Prepare for next hop
          assistantId = crypto.randomUUID();
          // Re-append thinking row for next hop
          if (hop < MAX_TOOL_HOPS - 1) {
            appendRow({ kind: "thinking", id: assistantId + "-thinking" });
          }
        }

        // Auto-title session from first user message
        if (mountedRef.current) {
          const currentSess = currentSessionRef.current;
          if (currentSess && !currentSess.title) {
            const title = content.length > 50 ? content.slice(0, 47) + "…" : content;
            aiUpdateSessionTitle(sessionId, title)
              .then(() => {
                if (mountedRef.current) {
                  setSessions((prev) =>
                    prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
                  );
                  setCurrentSession((prev) => (prev ? { ...prev, title } : prev));
                }
              })
              .catch((e) => logAIError("auto-title", e));
          }
        }
      } catch (e) {
        if (mountedRef.current) {
          const msg = String(e);
          setError(msg);
          setTranscript((prev) => {
            const hasThinking = prev.some((r) => r.id === thinkingId);
            const errRow: TranscriptRow = { kind: "error", id: crypto.randomUUID(), content: msg };
            if (hasThinking) {
              return prev.map((r) => (r.id === thinkingId ? errRow : r));
            }
            return [...prev, errRow];
          });
          approval.resolveAll(false);
        }
      } finally {
        if (mountedRef.current) {
          setIsStreaming(false);
          setCurrentToolHop(0);
        }
      }
    },
    [isStreaming, appendRow, approval, streamOnce]
  );

  return {
    sessions,
    currentSession,
    transcript,
    isStreaming,
    lastTurnStats,
    currentToolHop,
    error,
    sendMessage,
    cancelStream,
    createSession,
    loadSession,
    deleteSession,
    renameSession,
    refreshSessions,
    resolveApproval: approval.resolve,
  };
}
