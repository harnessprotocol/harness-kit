import { Channel } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AIChatMessage,
  type AIMessageRow,
  type AISessionRow,
  aiCancelStream,
  aiCreateSession,
  aiDeleteSession,
  aiListSessions,
  aiLoadSession,
  aiSaveMessage,
  aiStreamChat,
  aiUpdateSessionTitle,
  type ChatChunk,
} from "../lib/tauri";

// ─── Public types ────────────────────────────────────────────────────────────

export interface AIChatMessageDisplay {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface UseAIChatReturn {
  sessions: AISessionRow[];
  currentSession: AISessionRow | null;
  messages: AIChatMessageDisplay[];
  streamingContent: string;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (content: string, model: string) => Promise<void>;
  cancelStream: () => void;
  createSession: (model: string) => Promise<string>;
  loadSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAIChat(): UseAIChatReturn {
  const [sessions, setSessions] = useState<AISessionRow[]>([]);
  const [currentSession, setCurrentSession] = useState<AISessionRow | null>(null);
  const [messages, setMessages] = useState<AIChatMessageDisplay[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for use inside async callbacks / Channel.onmessage (prevents stale closures)
  const currentSessionRef = useRef<AISessionRow | null>(null);
  const messagesRef = useRef<AIChatMessageDisplay[]>([]);
  const mountedRef = useRef(true);

  // Keep refs in sync with state
  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
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

  // Load sessions on mount
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const createSession = useCallback(async (model: string): Promise<string> => {
    const id = crypto.randomUUID();
    await aiCreateSession(id, model);
    const newSession: AISessionRow = {
      id,
      title: null,
      model,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (mountedRef.current) {
      setCurrentSession(newSession);
      setMessages([]);
      setSessions((prev) => [newSession, ...prev]);
    }
    return id;
  }, []);

  const loadSession = useCallback(async (id: string) => {
    try {
      const [session, rows] = await aiLoadSession(id);
      if (!mountedRef.current) return;

      const displayed: AIChatMessageDisplay[] = rows.map((r: AIMessageRow) => ({
        id: r.id,
        role: r.role as "user" | "assistant",
        content: r.content,
        timestamp: r.timestamp,
      }));

      setCurrentSession(session);
      setMessages(displayed);
      setStreamingContent("");
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
      setMessages([]);
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
    aiCancelStream().catch(() => {});
  }, []);

  const sendMessage = useCallback(
    async (content: string, model: string) => {
      if (isStreaming) return;

      setError(null);
      setIsStreaming(true);
      setStreamingContent("");

      // Ensure we have a session — create one if needed
      let session = currentSessionRef.current;
      if (!session) {
        try {
          const id = crypto.randomUUID();
          await aiCreateSession(id, model);
          session = {
            id,
            title: null,
            model,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          if (mountedRef.current) {
            setCurrentSession(session);
            currentSessionRef.current = session;
            setSessions((prev) => [session!, ...prev]);
          }
        } catch (e) {
          if (mountedRef.current) {
            setError(String(e));
            setIsStreaming(false);
          }
          return;
        }
      }

      const sessionId = session.id;

      // Persist user message
      const userMsgId = crypto.randomUUID();
      const userTimestamp = new Date().toISOString();
      const userMsg: AIChatMessageDisplay = {
        id: userMsgId,
        role: "user",
        content,
        timestamp: userTimestamp,
      };

      try {
        await aiSaveMessage(userMsgId, sessionId, "user", content);
      } catch {
        // Non-fatal — display message anyway
      }

      if (mountedRef.current) {
        setMessages((prev) => {
          const next = [...prev, userMsg];
          messagesRef.current = next;
          return next;
        });
      }

      // Build conversation history for Ollama
      const conversationMessages: AIChatMessage[] = messagesRef.current.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Stream the response
      let fullResponse = "";
      const channel = new Channel<ChatChunk>();

      channel.onmessage = (chunk: ChatChunk) => {
        if (!mountedRef.current) return;

        fullResponse += chunk.content;
        setStreamingContent(fullResponse);

        if (chunk.done) {
          const assistantMsgId = crypto.randomUUID();
          const assistantTimestamp = new Date().toISOString();
          const assistantMsg: AIChatMessageDisplay = {
            id: assistantMsgId,
            role: "assistant",
            content: fullResponse,
            timestamp: assistantTimestamp,
          };

          setMessages((prev) => {
            const next = [...prev, assistantMsg];
            messagesRef.current = next;
            return next;
          });
          setStreamingContent("");
          setIsStreaming(false);

          // Persist assistant message (fire and forget)
          aiSaveMessage(assistantMsgId, sessionId, "assistant", fullResponse).catch(() => {});

          // Auto-title the session from the first user message if still untitled
          const currentSess = currentSessionRef.current;
          if (currentSess && !currentSess.title) {
            const title = content.length > 50 ? content.slice(0, 47) + "…" : content;
            aiUpdateSessionTitle(sessionId, title)
              .then(() => {
                if (mountedRef.current) {
                  const update = (s: AISessionRow) => (s.id === sessionId ? { ...s, title } : s);
                  setSessions((prev) => prev.map(update));
                  setCurrentSession((prev) => (prev ? { ...prev, title } : prev));
                }
              })
              .catch(() => {});
          }
        }
      };

      try {
        await aiStreamChat(model, conversationMessages, channel);
      } catch (e) {
        if (!mountedRef.current) return;
        setError(String(e));
        setStreamingContent("");
        setIsStreaming(false);
      }
    },
    [isStreaming],
  );

  return {
    sessions,
    currentSession,
    messages,
    streamingContent,
    isStreaming,
    error,
    sendMessage,
    cancelStream,
    createSession,
    loadSession,
    deleteSession,
    renameSession,
    refreshSessions,
  };
}
