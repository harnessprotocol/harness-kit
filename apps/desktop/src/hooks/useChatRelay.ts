import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type {
  AnyMessage,
  Member,
  ServerMessage,
  ClientMessage,
  ShareMessage,
} from "@harness-kit/shared";
import {
  chatSaveMessages,
  chatLoadMessages,
  chatSaveRoom,
  chatLeaveRoom,
  chatListRooms,
  chatStopLocalRelay,
} from "../lib/tauri";
import type { ChatRoomRow } from "../lib/tauri";
import { onChatShare } from "../lib/chat-events";

// ── State types ──────────────────────────────────────────────

export type ChatState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; serverUrl: string }
  | {
      status: "in_room";
      serverUrl: string;
      roomCode: string;
      roomName: string | null;
      nickname: string;
      members: Member[];
      messages: AnyMessage[];
      isHost: boolean;
    };

export interface UseChatRelayReturn {
  state: ChatState;
  connect: (serverUrl: string) => void;
  disconnect: () => void;
  createRoom: (nickname: string, name?: string, keepAliveMinutes?: number) => void;
  joinRoom: (code: string, nickname: string) => void;
  leaveRoom: () => void;
  sendChat: (body: string) => void;
  sendShare: (share: Omit<ShareMessage, "id" | "roomCode" | "nickname" | "timestamp" | "type">) => void;
  sendTyping: (typing: boolean) => void;
  shutdownServer: () => void;
  recentRooms: ChatRoomRow[];
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  unreadCount: number;
  typingMembers: string[];
}

// ── localStorage keys ────────────────────────────────────────

const LS_SERVER = "harness-kit-chat-server";
const LS_NICK = "harness-kit-chat-nick";

function loadStoredServer(): string {
  try { return localStorage.getItem(LS_SERVER) ?? ""; } catch { return ""; }
}

function saveServer(url: string) {
  try { localStorage.setItem(LS_SERVER, url); } catch {}
}

function saveNick(nick: string) {
  try { localStorage.setItem(LS_NICK, nick); } catch {}
}

// ── Hook ─────────────────────────────────────────────────────

export function useChatRelay(): UseChatRelayReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connIdRef = useRef(0);
  const lastRoomRef = useRef<{ code: string; nickname: string } | null>(null);

  const isHostRef = useRef(false);

  // Refs for values needed inside WS callbacks without triggering re-renders
  const isOpenRef = useRef(false);
  const stateRef = useRef<ChatState>({ status: "disconnected" });

  const [state, setStateInner] = useState<ChatState>({ status: "disconnected" });
  const [isOpen, setIsOpenState] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentRooms, setRecentRooms] = useState<ChatRoomRow[]>([]);

  function setState(next: ChatState) {
    stateRef.current = next;
    setStateInner(next);
  }

  const setOpen = useCallback((open: boolean) => {
    isOpenRef.current = open;
    setIsOpenState(open);
    if (open) setUnreadCount(0);
  }, []);

  // Load recent rooms list
  const refreshRooms = useCallback(() => {
    chatListRooms().then(setRecentRooms).catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshRooms();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [refreshRooms]);

  // ── Send helper ──────────────────────────────────────────

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // ── Server message handler ───────────────────────────────

  const handleServerMessage = useCallback((raw: string, connId: number) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch (err) {
      console.warn("[chat] failed to parse server message:", err);
      return;
    }

    const current = stateRef.current;

    switch (msg.type) {
      case "room_created": {
        // After creating a room, we'll receive room_joined next (server sends both)
        break;
      }

      case "room_joined": {
        const serverUrl = current.status === "connecting" || current.status === "connected"
          ? (current as { serverUrl?: string }).serverUrl ?? loadStoredServer()
          : loadStoredServer();

        // Determine nickname from stored value since we may not have state for it
        const storedNick = (() => {
          try { return localStorage.getItem(LS_NICK) ?? ""; } catch { return ""; }
        })();
        const myNick = (() => {
          if (current.status === "in_room") return current.nickname;
          return storedNick;
        })();

        const roomCode = msg.code;
        const roomName = msg.name ?? null;
        const relayMessages = msg.history ?? [];
        const members = msg.members;
        const urlToSave = serverUrl;

        // Load local scrollback in an async IIFE; guard against stale connection
        void (async () => {
          let localMessages: AnyMessage[] = [];
          try {
            const rows = await chatLoadMessages(roomCode, 200);
            // Guard: if connection changed while we were awaiting, bail out
            if (connIdRef.current !== connId) return;
            localMessages = rows.map((r) => {
              const base = { id: r.id, roomCode: r.roomCode, nickname: r.nickname, timestamp: r.timestamp };
              if (r.msgType === "chat") {
                return { ...base, type: "chat" as const, body: r.body ?? "" };
              } else if (r.msgType === "share") {
                return {
                  ...base,
                  type: "share" as const,
                  action: r.action as import("@harness-kit/shared").ShareAction,
                  target: r.target ?? "",
                  detail: r.detail ?? null,
                  diff: null,
                  pullable: false,
                };
              } else {
                return {
                  ...base,
                  type: "system" as const,
                  event: (r.eventType ?? "join") as import("@harness-kit/shared").SystemMessage["event"],
                  detail: r.detail ?? null,
                };
              }
            });
          } catch { /* ignore */ }

          // Merge: relay history wins; dedupe by id
          const merged = new Map<string, AnyMessage>();
          for (const m of localMessages) merged.set(m.id, m);
          for (const m of relayMessages) merged.set(m.id, m);
          const messages = Array.from(merged.values()).sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );

          // Persist to SQLite
          if (messages.length > 0) {
            chatSaveMessages(messages.map((m) => {
              const base = { id: m.id, roomCode: m.roomCode, nickname: m.nickname, timestamp: m.timestamp };
              if (m.type === "chat") {
                return { ...base, msgType: "chat", body: m.body, action: null, target: null, detail: null, eventType: null };
              } else if (m.type === "share") {
                return { ...base, msgType: "share", body: null, action: m.action, target: m.target, detail: m.detail, eventType: null };
              } else {
                return { ...base, msgType: "system", body: null, action: null, target: null, detail: m.detail, eventType: m.event };
              }
            })).catch(err => console.warn("[chat] failed to save messages:", err));
          }

          // Save room to SQLite
          chatSaveRoom(roomCode, roomName, myNick, urlToSave).catch(err => console.warn("[chat] failed to save room:", err));

          lastRoomRef.current = { code: roomCode, nickname: myNick };

          setState({
            status: "in_room",
            serverUrl: urlToSave,
            roomCode,
            roomName,
            nickname: myNick,
            members,
            messages,
            isHost: isHostRef.current,
          });

          refreshRooms();
        })();
        break;
      }

      case "room_error": {
        console.warn("[chat] room error:", msg.error);
        // Clear lastRoomRef on nickname collision to prevent infinite auto-rejoin loop:
        // if we reconnect and the same nick is still taken, the rejoin would fail again.
        if (msg.error?.toLowerCase().includes("already taken")) {
          lastRoomRef.current = null;
        }
        break;
      }

      case "message": {
        const incoming = msg.message;

        // Append to state if in_room
        if (stateRef.current.status === "in_room") {
          setState({
            ...stateRef.current,
            messages: [...stateRef.current.messages, incoming],
          });
        }

        // Increment unread if panel is closed
        if (!isOpenRef.current) {
          setUnreadCount((n) => n + 1);
        }

        // Persist
        const row = (() => {
          const base = { id: incoming.id, roomCode: incoming.roomCode, nickname: incoming.nickname, timestamp: incoming.timestamp };
          if (incoming.type === "chat") {
            return { ...base, msgType: "chat", body: incoming.body, action: null, target: null, detail: null, eventType: null };
          } else if (incoming.type === "share") {
            return { ...base, msgType: "share", body: null, action: incoming.action, target: incoming.target, detail: incoming.detail, eventType: null };
          } else {
            return { ...base, msgType: "system", body: null, action: null, target: null, detail: incoming.detail, eventType: incoming.event };
          }
        })();
        chatSaveMessages([row]).catch(err => console.warn("[chat] failed to save messages:", err));
        break;
      }

      case "presence": {
        if (stateRef.current.status === "in_room") {
          setState({ ...stateRef.current, members: msg.members });
        }
        break;
      }

      case "typing_update": {
        if (stateRef.current.status === "in_room") {
          setState({
            ...stateRef.current,
            members: stateRef.current.members.map((m) =>
              m.nickname === msg.nickname ? { ...m, typing: msg.typing } : m,
            ),
          });
        }
        break;
      }
    }
  }, [refreshRooms]);

  // ── Connect ──────────────────────────────────────────────

  const connect = useCallback((serverUrl: string) => {
    if (!mountedRef.current) return;

    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Bump connection ID so stale callbacks can detect they're obsolete
    const connId = ++connIdRef.current;

    saveServer(serverUrl);
    setState({ status: "connecting" });

    try {
      const ws = new WebSocket(serverUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (connIdRef.current !== connId) { ws.close(); return; }
        if (!mountedRef.current) return;
        setState({ status: "connected", serverUrl });
        // Auto-rejoin previous room if connection was re-established
        if (lastRoomRef.current) {
          const { code, nickname } = lastRoomRef.current;
          setTimeout(() => {
            if (connIdRef.current === connId && mountedRef.current) {
              send({ type: "join_room", code, nickname });
            }
          }, 1000);
        }
      };

      ws.onmessage = (evt) => {
        if (connIdRef.current !== connId) return;
        handleServerMessage(evt.data as string, connId);
      };

      ws.onclose = () => {
        if (connIdRef.current !== connId) return;
        if (!mountedRef.current) return;
        // If we were in a room, drop back to connected-but-not-in-room
        const cur = stateRef.current;
        if (cur.status === "in_room") {
          setState({ status: "connected", serverUrl: cur.serverUrl });
          // Attempt reconnect
          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) connect(cur.serverUrl);
          }, 2000);
        } else if (cur.status === "connected") {
          setState({ status: "disconnected" });
        } else {
          setState({ status: "disconnected" });
        }
      };

      ws.onerror = () => ws.close();
    } catch {
      setState({ status: "disconnected" });
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect(serverUrl);
      }, 5000);
    }
  }, [handleServerMessage, send]);

  // ── Disconnect ───────────────────────────────────────────

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    isHostRef.current = false;
    setState({ status: "disconnected" });
  }, []);

  // ── Room actions ─────────────────────────────────────────

  const createRoom = useCallback((nickname: string, name?: string, keepAliveMinutes?: number) => {
    saveNick(nickname);
    // Update nickname in stateRef so room_joined handler can pick it up
    if (stateRef.current.status === "connected") {
      // store in localStorage for room_joined handler
      saveNick(nickname);
    }
    isHostRef.current = true;
    const msg: ClientMessage = {
      type: "create_room",
      nickname,
      ...(name !== undefined && { name }),
      ...(keepAliveMinutes !== undefined && { keepAliveMinutes }),
    };
    send(msg);
  }, [send]);

  const joinRoom = useCallback((code: string, nickname: string) => {
    isHostRef.current = false;
    saveNick(nickname);
    send({ type: "join_room", code, nickname });
  }, [send]);

  const leaveRoom = useCallback(() => {
    const cur = stateRef.current;
    if (cur.status === "in_room") {
      lastRoomRef.current = null;
      isHostRef.current = false;
      send({ type: "leave_room" });
      chatLeaveRoom(cur.roomCode).catch(() => {});
      setState({ status: "connected", serverUrl: cur.serverUrl });
      refreshRooms();
    }
  }, [send, refreshRooms]);

  const sendChat = useCallback((body: string) => {
    if (!body.trim()) return;
    send({ type: "chat", body: body.trim() });
  }, [send]);

  const sendShare = useCallback((shareData: Omit<ShareMessage, "id" | "roomCode" | "nickname" | "timestamp" | "type">) => {
    const current = stateRef.current;
    if (current.status !== "in_room" || !wsRef.current) return;
    const msg: ClientMessage = {
      type: "share",
      action: shareData.action,
      target: shareData.target,
      detail: shareData.detail ?? undefined,
      diff: shareData.diff ?? undefined,
      pullable: shareData.pullable,
    };
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  // Listen for cross-page share events emitted via emitChatShare()
  useEffect(() => {
    const cleanup = onChatShare((shareData) => {
      sendShare(shareData);
    });
    return cleanup;
  }, [sendShare]);

  const sendTyping = useCallback((typing: boolean) => {
    send({ type: "typing", typing });
  }, [send]);

  const shutdownServer = useCallback(() => {
    sendChat("[server shutting down]");
    setTimeout(() => {
      chatStopLocalRelay().catch(() => {});
      disconnect();
    }, 300);
  }, [sendChat, disconnect]);

  const typingMembers = useMemo(() => {
    if (state.status !== "in_room") return [];
    return state.members
      .filter((m) => m.typing && m.nickname !== state.nickname)
      .map((m) => m.nickname);
  }, [state]);

  return {
    state,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    leaveRoom,
    sendChat,
    sendShare,
    sendTyping,
    shutdownServer,
    recentRooms,
    isOpen,
    setOpen,
    unreadCount,
    typingMembers,
  };
}
