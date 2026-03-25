import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { ChatProvider } from "../../context/ChatContext";
import { useChatRelay } from "../useChatRelay";
import type { ServerMessage } from "@harness-kit/shared";

// ── Tauri mock ────────────────────────────────────────────────

vi.mock("../../lib/tauri", () => ({
  chatSaveRoom: vi.fn().mockResolvedValue(undefined),
  chatLeaveRoom: vi.fn().mockResolvedValue(undefined),
  chatListRooms: vi.fn().mockResolvedValue([]),
  chatSaveMessages: vi.fn().mockResolvedValue(undefined),
  chatLoadMessages: vi.fn().mockResolvedValue([]),
  chatPurgeRoom: vi.fn().mockResolvedValue(undefined),
}));

// ── WebSocket mock ────────────────────────────────────────────
//
// vi.stubGlobal with a plain arrow function would fail the "must use function
// or class" check when it's called as `new WebSocket(url)`. We use a class
// so the mock is a valid constructor and every instantiation fills in the
// same shared mockWsInstance so tests can inspect/drive it.

const mockWsInstance = {
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1,
  onopen: null as ((ev: Event) => void) | null,
  onmessage: null as ((ev: MessageEvent) => void) | null,
  onclose: null as ((ev: CloseEvent) => void) | null,
  onerror: null as ((ev: Event) => void) | null,
};

class MockWebSocket {
  static OPEN = 1;
  send = mockWsInstance.send;
  close = mockWsInstance.close;
  readyState = mockWsInstance.readyState;
  set onopen(fn: ((ev: Event) => void) | null) { mockWsInstance.onopen = fn; }
  get onopen() { return mockWsInstance.onopen; }
  set onmessage(fn: ((ev: MessageEvent) => void) | null) { mockWsInstance.onmessage = fn; }
  get onmessage() { return mockWsInstance.onmessage; }
  set onclose(fn: ((ev: CloseEvent) => void) | null) { mockWsInstance.onclose = fn; }
  get onclose() { return mockWsInstance.onclose; }
  set onerror(fn: ((ev: Event) => void) | null) { mockWsInstance.onerror = fn; }
  get onerror() { return mockWsInstance.onerror; }
}

vi.stubGlobal("WebSocket", MockWebSocket);

// ── Helpers ───────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ChatProvider, null, children);
}

function renderChat() {
  return renderHook(() => useChatRelay(), { wrapper });
}

/** Simulate the WS connection becoming open */
function fireOpen() {
  act(() => {
    mockWsInstance.onopen?.(new Event("open"));
  });
}

/** Simulate a ServerMessage arriving from the relay */
function fireMessage(msg: ServerMessage) {
  act(() => {
    mockWsInstance.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(msg) }),
    );
  });
}

// ── Setup / teardown ──────────────────────────────────────────

beforeEach(() => {
  mockWsInstance.send.mockReset();
  mockWsInstance.close.mockReset();
  mockWsInstance.onopen = null;
  mockWsInstance.onmessage = null;
  mockWsInstance.onclose = null;
  mockWsInstance.onerror = null;
  mockWsInstance.readyState = 1;
});

afterEach(() => {
  vi.clearAllTimers();
});

// ── Tests ─────────────────────────────────────────────────────

describe("initial state", () => {
  it("status is disconnected", () => {
    const { result } = renderChat();
    expect(result.current.state.status).toBe("disconnected");
  });

  it("unreadCount is 0", () => {
    const { result } = renderChat();
    expect(result.current.unreadCount).toBe(0);
  });

  it("isOpen is false", () => {
    const { result } = renderChat();
    expect(result.current.isOpen).toBe(false);
  });
});

describe("connect()", () => {
  it("transitions to connecting immediately", () => {
    const { result } = renderChat();
    act(() => {
      result.current.connect("ws://localhost:8080");
    });
    expect(result.current.state.status).toBe("connecting");
  });

  it("transitions to connected when onopen fires", () => {
    const { result } = renderChat();
    act(() => {
      result.current.connect("ws://localhost:8080");
    });
    fireOpen();
    expect(result.current.state.status).toBe("connected");
  });
});

describe("createRoom()", () => {
  it("sends create_room message with nickname when connected", () => {
    const { result } = renderChat();
    act(() => { result.current.connect("ws://localhost:8080"); });
    fireOpen();

    act(() => { result.current.createRoom("alice"); });

    expect(mockWsInstance.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"create_room"'),
    );
    expect(mockWsInstance.send).toHaveBeenCalledWith(
      expect.stringContaining('"nickname":"alice"'),
    );
  });
});

describe("joinRoom()", () => {
  it("sends join_room message with code and nickname when connected", () => {
    const { result } = renderChat();
    act(() => { result.current.connect("ws://localhost:8080"); });
    fireOpen();

    act(() => { result.current.joinRoom("ABCD", "bob"); });

    expect(mockWsInstance.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"join_room"'),
    );
    expect(mockWsInstance.send).toHaveBeenCalledWith(
      expect.stringContaining('"code":"ABCD"'),
    );
    expect(mockWsInstance.send).toHaveBeenCalledWith(
      expect.stringContaining('"nickname":"bob"'),
    );
  });
});

describe("sendChat()", () => {
  it("sends chat message when in_room", async () => {
    const { result } = renderChat();
    act(() => { result.current.connect("ws://localhost:8080"); });
    fireOpen();

    localStorage.setItem("harness-kit-chat-nick", "alice");

    // Transition to in_room via room_joined
    fireMessage({
      type: "room_joined",
      code: "XYZW",
      members: [{ nickname: "alice", joinedAt: new Date().toISOString(), typing: false }],
      history: [],
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("in_room");
    });

    mockWsInstance.send.mockReset();
    act(() => { result.current.sendChat("hello world"); });

    expect(mockWsInstance.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"chat"'),
    );
    expect(mockWsInstance.send).toHaveBeenCalledWith(
      expect.stringContaining('"body":"hello world"'),
    );
  });

  it("does NOT send chat when disconnected (no WebSocket)", () => {
    const { result } = renderChat();
    // Never connect — wsRef.current is null
    mockWsInstance.send.mockReset();

    act(() => { result.current.sendChat("should not send"); });

    expect(mockWsInstance.send).not.toHaveBeenCalled();
  });
});

describe("room_joined ServerMessage", () => {
  it("transitions state to in_room with correct roomCode and nickname", async () => {
    const { result } = renderChat();
    act(() => { result.current.connect("ws://localhost:8080"); });
    fireOpen();

    // Set localStorage nick so the hook can pick it up
    localStorage.setItem("harness-kit-chat-nick", "carol");

    fireMessage({
      type: "room_joined",
      code: "R001",
      name: "my-room",
      members: [{ nickname: "carol", joinedAt: new Date().toISOString(), typing: false }],
      history: [],
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("in_room");
    });

    const state = result.current.state as Extract<typeof result.current.state, { status: "in_room" }>;
    expect(state.roomCode).toBe("R001");
    expect(state.nickname).toBe("carol");
  });
});

describe("message ServerMessage", () => {
  it("appends incoming chat message to state.messages", async () => {
    const { result } = renderChat();
    act(() => { result.current.connect("ws://localhost:8080"); });
    fireOpen();

    localStorage.setItem("harness-kit-chat-nick", "alice");

    fireMessage({
      type: "room_joined",
      code: "MSGS",
      members: [{ nickname: "alice", joinedAt: new Date().toISOString(), typing: false }],
      history: [],
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("in_room");
    });

    fireMessage({
      type: "message",
      message: {
        id: "m1",
        roomCode: "MSGS",
        type: "chat",
        nickname: "bob",
        timestamp: new Date().toISOString(),
        body: "hey there",
      },
    });

    await waitFor(() => {
      const s = result.current.state as Extract<typeof result.current.state, { status: "in_room" }>;
      expect(s.messages.length).toBeGreaterThan(0);
    });

    const s = result.current.state as Extract<typeof result.current.state, { status: "in_room" }>;
    const last = s.messages[s.messages.length - 1];
    expect(last.id).toBe("m1");
    expect((last as { body: string }).body).toBe("hey there");
  });
});

describe("unreadCount", () => {
  it("increments when panel is closed (isOpen=false) and a message arrives", async () => {
    const { result } = renderChat();
    act(() => { result.current.connect("ws://localhost:8080"); });
    fireOpen();

    localStorage.setItem("harness-kit-chat-nick", "alice");

    fireMessage({
      type: "room_joined",
      code: "UNRD",
      members: [{ nickname: "alice", joinedAt: new Date().toISOString(), typing: false }],
      history: [],
    });

    await waitFor(() => { expect(result.current.state.status).toBe("in_room"); });

    // Panel is closed (default)
    expect(result.current.isOpen).toBe(false);

    fireMessage({
      type: "message",
      message: {
        id: "u1",
        roomCode: "UNRD",
        type: "chat",
        nickname: "bob",
        timestamp: new Date().toISOString(),
        body: "ping",
      },
    });

    await waitFor(() => { expect(result.current.unreadCount).toBe(1); });
  });

  it("resets to 0 when setOpen(true) is called", async () => {
    const { result } = renderChat();
    act(() => { result.current.connect("ws://localhost:8080"); });
    fireOpen();

    localStorage.setItem("harness-kit-chat-nick", "alice");

    fireMessage({
      type: "room_joined",
      code: "UNRD2",
      members: [{ nickname: "alice", joinedAt: new Date().toISOString(), typing: false }],
      history: [],
    });

    await waitFor(() => { expect(result.current.state.status).toBe("in_room"); });

    fireMessage({
      type: "message",
      message: {
        id: "u2",
        roomCode: "UNRD2",
        type: "chat",
        nickname: "bob",
        timestamp: new Date().toISOString(),
        body: "ping",
      },
    });

    await waitFor(() => { expect(result.current.unreadCount).toBeGreaterThan(0); });

    act(() => { result.current.setOpen(true); });
    expect(result.current.unreadCount).toBe(0);
  });
});

describe("leaveRoom()", () => {
  it("sends leave_room and transitions back to connected", async () => {
    const { result } = renderChat();
    act(() => { result.current.connect("ws://localhost:8080"); });
    fireOpen();

    localStorage.setItem("harness-kit-chat-nick", "alice");

    fireMessage({
      type: "room_joined",
      code: "LEAV",
      members: [{ nickname: "alice", joinedAt: new Date().toISOString(), typing: false }],
      history: [],
    });

    await waitFor(() => { expect(result.current.state.status).toBe("in_room"); });

    mockWsInstance.send.mockReset();
    act(() => { result.current.leaveRoom(); });

    expect(mockWsInstance.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"leave_room"'),
    );
    expect(result.current.state.status).toBe("connected");
  });
});
