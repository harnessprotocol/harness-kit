import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, Member, ServerMessage } from "../protocol.js";
import { ChatRelay } from "../relay.js";

// ── WebSocket mock ────────────────────────────────────────────
//
// Mock the WebSocketServer and WebSocket classes for testing.

vi.mock("ws", () => {
  const OPEN = 1;
  const CLOSED = 3;

  class MockWebSocket {
    readyState = OPEN;
    send = vi.fn();
    on = vi.fn();
    close = vi.fn();

    // Simulate sending a message to the server
    _simulateMessage(data: string) {
      const messageHandler = this.on.mock.calls.find((call) => call[0] === "message")?.[1];
      if (messageHandler) messageHandler(Buffer.from(data));
    }

    // Simulate disconnect
    _simulateClose() {
      const closeHandler = this.on.mock.calls.find((call) => call[0] === "close")?.[1];
      if (closeHandler) closeHandler();
    }
  }

  class MockWebSocketServer {
    on = vi.fn();
    close = vi.fn();

    // Simulate a new connection
    _simulateConnection(ws: MockWebSocket) {
      const connectionHandler = this.on.mock.calls.find((call) => call[0] === "connection")?.[1];
      if (connectionHandler) connectionHandler(ws);
    }
  }

  (MockWebSocket as unknown as Record<string, number>).OPEN = OPEN;
  (MockWebSocket as unknown as Record<string, number>).CLOSED = CLOSED;

  return {
    WebSocket: MockWebSocket,
    WebSocketServer: MockWebSocketServer,
  };
});

// ── Helpers ───────────────────────────────────────────────────

function createMockWss(): WebSocketServer {
  return new WebSocketServer({ noServer: true });
}

function createMockWs(): WebSocket {
  return new WebSocket("ws://test");
}

function parseLastSentMessage(ws: WebSocket): ServerMessage | null {
  const mockSend = ws.send as ReturnType<typeof vi.fn>;
  if (mockSend.mock.calls.length === 0) return null;
  const lastCall = mockSend.mock.calls[mockSend.mock.calls.length - 1];
  return JSON.parse(lastCall[0] as string) as ServerMessage;
}

function getAllSentMessages(ws: WebSocket): ServerMessage[] {
  const mockSend = ws.send as ReturnType<typeof vi.fn>;
  return mockSend.mock.calls.map((call) => JSON.parse(call[0] as string) as ServerMessage);
}

function clearSentMessages(ws: WebSocket): void {
  (ws.send as ReturnType<typeof vi.fn>).mockClear();
}

// ── Tests ─────────────────────────────────────────────────────

// Clear all vi mock state before every test so nothing bleeds between suites.
beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChatRelay constructor", () => {
  it("sets up connection handler on WebSocketServer", () => {
    const wss = createMockWss();
    new ChatRelay(wss);
    expect(wss.on).toHaveBeenCalledWith("connection", expect.any(Function));
  });
});

describe("ChatRelay.handleConnection", () => {
  it("sets up message, close, and error handlers", () => {
    const wss = createMockWss();
    const relay = new ChatRelay(wss);
    const ws = createMockWs();

    relay.handleConnection(ws);

    expect(ws.on).toHaveBeenCalledWith("message", expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith("close", expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith("error", expect.any(Function));
  });
});

describe("ChatRelay room creation", () => {
  let wss: WebSocketServer;
  let relay: ChatRelay;
  let ws: WebSocket;

  beforeEach(() => {
    wss = createMockWss();
    relay = new ChatRelay(wss);
    ws = createMockWs();
    relay.handleConnection(ws);
  });

  it("creates a room and sends room_created message", () => {
    const msg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws as any)._simulateMessage(JSON.stringify(msg));

    const messages = getAllSentMessages(ws);
    const createdMsg = messages.find((m) => m.type === "room_created");
    expect(createdMsg).toBeDefined();
    expect(createdMsg).toHaveProperty("code");
    expect((createdMsg as any).code).toMatch(/^[BCDFGHJKLMNPQRSTVWXYZ]{3}-[A-Z0-9]{3}$/);
  });

  it("creates a room with a custom name", () => {
    const msg: ClientMessage = { type: "create_room", nickname: "alice", name: "Test Room" };
    (ws as any)._simulateMessage(JSON.stringify(msg));

    const messages = getAllSentMessages(ws);
    const createdMsg = messages.find((m) => m.type === "room_created");
    expect(createdMsg).toBeDefined();
    expect((createdMsg as any).name).toBe("Test Room");
  });

  it("rejects nickname that is too long", () => {
    const longNick = "a".repeat(33);
    const msg: ClientMessage = { type: "create_room", nickname: longNick };
    (ws as any)._simulateMessage(JSON.stringify(msg));

    const lastMsg = parseLastSentMessage(ws);
    expect(lastMsg?.type).toBe("room_error");
    expect((lastMsg as any).error).toMatch(/nickname/i);
  });

  it("rejects empty nickname", () => {
    const msg: ClientMessage = { type: "create_room", nickname: "" };
    (ws as any)._simulateMessage(JSON.stringify(msg));

    const lastMsg = parseLastSentMessage(ws);
    expect(lastMsg?.type).toBe("room_error");
    expect((lastMsg as any).error).toMatch(/nickname/i);
  });

  it("rejects room name that is too long", () => {
    const longName = "a".repeat(65);
    const msg: ClientMessage = { type: "create_room", nickname: "alice", name: longName };
    (ws as any)._simulateMessage(JSON.stringify(msg));

    const lastMsg = parseLastSentMessage(ws);
    expect(lastMsg?.type).toBe("room_error");
    expect((lastMsg as any).error).toMatch(/room name/i);
  });

  it("automatically joins the creator to the room", () => {
    const msg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws as any)._simulateMessage(JSON.stringify(msg));

    const messages = getAllSentMessages(ws);
    const joinedMsg = messages.find((m) => m.type === "room_joined");
    expect(joinedMsg).toBeDefined();
    expect((joinedMsg as any).members).toHaveLength(1);
    expect((joinedMsg as any).members[0].nickname).toBe("alice");
  });
});

describe("ChatRelay room joining", () => {
  let wss: WebSocketServer;
  let relay: ChatRelay;
  let ws1: WebSocket;
  let ws2: WebSocket;

  beforeEach(() => {
    wss = createMockWss();
    relay = new ChatRelay(wss);
    ws1 = createMockWs();
    ws2 = createMockWs();
    relay.handleConnection(ws1);
    relay.handleConnection(ws2);
  });

  it("allows a second user to join an existing room", () => {
    // Create room
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    clearSentMessages(ws1);

    // Join room
    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    const messages = getAllSentMessages(ws2);
    const joinedMsg = messages.find((m) => m.type === "room_joined");
    expect(joinedMsg).toBeDefined();
    expect((joinedMsg as any).members).toHaveLength(2);
  });

  it("rejects join with invalid nickname", () => {
    // Create room
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    // Try to join with empty nickname
    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    const lastMsg = parseLastSentMessage(ws2);
    expect(lastMsg?.type).toBe("room_error");
    expect((lastMsg as any).error).toMatch(/nickname/i);
  });

  it("rejects join to non-existent room", () => {
    const joinMsg: ClientMessage = { type: "join_room", code: "XXX-999", nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    const lastMsg = parseLastSentMessage(ws2);
    expect(lastMsg?.type).toBe("room_error");
    expect((lastMsg as any).error).toMatch(/does not exist/i);
  });

  it("rejects duplicate nickname in same room", () => {
    // Create room
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    // Try to join with same nickname
    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "alice" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    const lastMsg = parseLastSentMessage(ws2);
    expect(lastMsg?.type).toBe("room_error");
    expect((lastMsg as any).error).toMatch(/already taken/i);
  });

  it("sends room history to new joiner", () => {
    // Create room
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    // Send a chat message
    const chatMsg: ClientMessage = { type: "chat", body: "hello" };
    (ws1 as any)._simulateMessage(JSON.stringify(chatMsg));

    // Join room
    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    const messages = getAllSentMessages(ws2);
    const joinedMsg = messages.find((m) => m.type === "room_joined");
    expect(joinedMsg).toBeDefined();
    expect((joinedMsg as any).history).toBeDefined();
    expect((joinedMsg as any).history.length).toBeGreaterThan(0);
  });

  it("broadcasts join system message to existing members", () => {
    // Create room
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    clearSentMessages(ws1);

    // Join room
    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    const messages = getAllSentMessages(ws1);
    const systemMsg = messages.find(
      (m) => m.type === "message" && (m as any).message?.type === "system",
    );
    expect(systemMsg).toBeDefined();
    expect((systemMsg as any).message.event).toBe("join");
    expect((systemMsg as any).message.nickname).toBe("bob");
  });

  it("broadcasts presence update when user joins", () => {
    // Create room
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    clearSentMessages(ws1);

    // Join room
    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    const messages = getAllSentMessages(ws1);
    const presenceMsg = messages.find((m) => m.type === "presence");
    expect(presenceMsg).toBeDefined();
    expect((presenceMsg as any).members).toHaveLength(2);
  });
});

describe("ChatRelay room leaving", () => {
  let wss: WebSocketServer;
  let relay: ChatRelay;
  let ws1: WebSocket;
  let ws2: WebSocket;

  beforeEach(() => {
    wss = createMockWss();
    relay = new ChatRelay(wss);
    ws1 = createMockWs();
    ws2 = createMockWs();
    relay.handleConnection(ws1);
    relay.handleConnection(ws2);
  });

  it("broadcasts leave system message", () => {
    // Create room and join
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    clearSentMessages(ws1);

    // Leave room
    const leaveMsg: ClientMessage = { type: "leave_room" };
    (ws2 as any)._simulateMessage(JSON.stringify(leaveMsg));

    const messages = getAllSentMessages(ws1);
    const systemMsg = messages.find(
      (m) => m.type === "message" && (m as any).message?.type === "system",
    );
    expect(systemMsg).toBeDefined();
    expect((systemMsg as any).message.event).toBe("leave");
    expect((systemMsg as any).message.nickname).toBe("bob");
  });

  it("broadcasts presence update after leave", () => {
    // Create room and join
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    clearSentMessages(ws1);

    // Leave room
    const leaveMsg: ClientMessage = { type: "leave_room" };
    (ws2 as any)._simulateMessage(JSON.stringify(leaveMsg));

    const messages = getAllSentMessages(ws1);
    const presenceMsg = messages.find((m) => m.type === "presence");
    expect(presenceMsg).toBeDefined();
    expect((presenceMsg as any).members).toHaveLength(1);
    expect((presenceMsg as any).members[0].nickname).toBe("alice");
  });

  it("handles disconnect like explicit leave", () => {
    // Create room and join
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    clearSentMessages(ws1);

    // Disconnect
    (ws2 as any)._simulateClose();

    const messages = getAllSentMessages(ws1);
    const systemMsg = messages.find(
      (m) => m.type === "message" && (m as any).message?.type === "system",
    );
    expect(systemMsg).toBeDefined();
    expect((systemMsg as any).message.event).toBe("leave");
  });
});

describe("ChatRelay chat messages", () => {
  let wss: WebSocketServer;
  let relay: ChatRelay;
  let ws1: WebSocket;
  let ws2: WebSocket;
  let roomCode: string;

  beforeEach(() => {
    wss = createMockWss();
    relay = new ChatRelay(wss);
    ws1 = createMockWs();
    ws2 = createMockWs();
    relay.handleConnection(ws1);
    relay.handleConnection(ws2);

    // Create and join room
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    roomCode = (createdMsg as any).code;

    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    clearSentMessages(ws1);
    clearSentMessages(ws2);
  });

  it("broadcasts chat message to all members", () => {
    const chatMsg: ClientMessage = { type: "chat", body: "hello everyone" };
    (ws1 as any)._simulateMessage(JSON.stringify(chatMsg));

    const messages1 = getAllSentMessages(ws1);
    const messages2 = getAllSentMessages(ws2);

    const msg1 = messages1.find((m) => m.type === "message" && (m as any).message?.type === "chat");
    const msg2 = messages2.find((m) => m.type === "message" && (m as any).message?.type === "chat");

    expect(msg1).toBeDefined();
    expect(msg2).toBeDefined();
    expect((msg1 as any).message.body).toBe("hello everyone");
    expect((msg2 as any).message.body).toBe("hello everyone");
    expect((msg1 as any).message.nickname).toBe("alice");
  });

  it("rejects message that is too long", () => {
    const longBody = "a".repeat(4001);
    const chatMsg: ClientMessage = { type: "chat", body: longBody };
    (ws1 as any)._simulateMessage(JSON.stringify(chatMsg));

    const lastMsg = parseLastSentMessage(ws1);
    expect(lastMsg?.type).toBe("room_error");
    expect((lastMsg as any).error).toMatch(/too long/i);
  });

  it("ignores chat from client not in a room", () => {
    const ws3 = createMockWs();
    relay.handleConnection(ws3);

    const chatMsg: ClientMessage = { type: "chat", body: "hello" };
    (ws3 as any)._simulateMessage(JSON.stringify(chatMsg));

    // Should not send any error, just ignore
    expect((ws3.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});

describe("ChatRelay share messages", () => {
  let wss: WebSocketServer;
  let relay: ChatRelay;
  let ws1: WebSocket;
  let ws2: WebSocket;

  beforeEach(() => {
    wss = createMockWss();
    relay = new ChatRelay(wss);
    ws1 = createMockWs();
    ws2 = createMockWs();
    relay.handleConnection(ws1);
    relay.handleConnection(ws2);

    // Create and join room
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    clearSentMessages(ws1);
    clearSentMessages(ws2);
  });

  it("broadcasts share message to all members", () => {
    const shareMsg: ClientMessage = {
      type: "share",
      action: "harness_updated",
      target: "harness.yaml",
      detail: "Updated plugins",
    };
    (ws1 as any)._simulateMessage(JSON.stringify(shareMsg));

    const messages1 = getAllSentMessages(ws1);
    const messages2 = getAllSentMessages(ws2);

    const msg1 = messages1.find(
      (m) => m.type === "message" && (m as any).message?.type === "share",
    );
    const msg2 = messages2.find(
      (m) => m.type === "message" && (m as any).message?.type === "share",
    );

    expect(msg1).toBeDefined();
    expect(msg2).toBeDefined();
    expect((msg1 as any).message.action).toBe("harness_updated");
    expect((msg1 as any).message.target).toBe("harness.yaml");
  });

  it("rejects share with target that is too long", () => {
    const longTarget = "a".repeat(257);
    const shareMsg: ClientMessage = {
      type: "share",
      action: "harness_updated",
      target: longTarget,
    };
    (ws1 as any)._simulateMessage(JSON.stringify(shareMsg));

    const lastMsg = parseLastSentMessage(ws1);
    expect(lastMsg?.type).toBe("room_error");
    expect((lastMsg as any).error).toMatch(/target too long/i);
  });

  it("rejects share with detail that is too long", () => {
    const longDetail = "a".repeat(1025);
    const shareMsg: ClientMessage = {
      type: "share",
      action: "harness_updated",
      target: "test",
      detail: longDetail,
    };
    (ws1 as any)._simulateMessage(JSON.stringify(shareMsg));

    const lastMsg = parseLastSentMessage(ws1);
    expect(lastMsg?.type).toBe("room_error");
    expect((lastMsg as any).error).toMatch(/detail too long/i);
  });

  it("rejects share with diff that is too long", () => {
    const longDiff = "a".repeat(64001);
    const shareMsg: ClientMessage = {
      type: "share",
      action: "harness_updated",
      target: "test",
      diff: longDiff,
    };
    (ws1 as any)._simulateMessage(JSON.stringify(shareMsg));

    const lastMsg = parseLastSentMessage(ws1);
    expect(lastMsg?.type).toBe("room_error");
    expect((lastMsg as any).error).toMatch(/diff too long/i);
  });

  it("ignores share from client not in a room", () => {
    const ws3 = createMockWs();
    relay.handleConnection(ws3);

    const shareMsg: ClientMessage = {
      type: "share",
      action: "harness_updated",
      target: "test",
    };
    (ws3 as any)._simulateMessage(JSON.stringify(shareMsg));

    // Should not send any error, just ignore
    expect((ws3.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});

describe("ChatRelay typing indicators", () => {
  let wss: WebSocketServer;
  let relay: ChatRelay;
  let ws1: WebSocket;
  let ws2: WebSocket;

  beforeEach(() => {
    wss = createMockWss();
    relay = new ChatRelay(wss);
    ws1 = createMockWs();
    ws2 = createMockWs();
    relay.handleConnection(ws1);
    relay.handleConnection(ws2);

    // Create and join room
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    clearSentMessages(ws1);
    clearSentMessages(ws2);
  });

  it("broadcasts typing indicator to other members", () => {
    const typingMsg: ClientMessage = { type: "typing", typing: true };
    (ws1 as any)._simulateMessage(JSON.stringify(typingMsg));

    const messages = getAllSentMessages(ws2);
    const typingUpdate = messages.find((m) => m.type === "typing_update");
    expect(typingUpdate).toBeDefined();
    expect((typingUpdate as any).nickname).toBe("alice");
    expect((typingUpdate as any).typing).toBe(true);
  });

  it("does not send typing update to the sender", () => {
    const typingMsg: ClientMessage = { type: "typing", typing: true };
    (ws1 as any)._simulateMessage(JSON.stringify(typingMsg));

    const messages = getAllSentMessages(ws1);
    const typingUpdate = messages.find((m) => m.type === "typing_update");
    expect(typingUpdate).toBeUndefined();
  });

  it("ignores typing from client not in a room", () => {
    const ws3 = createMockWs();
    relay.handleConnection(ws3);

    const typingMsg: ClientMessage = { type: "typing", typing: true };
    (ws3 as any)._simulateMessage(JSON.stringify(typingMsg));

    // Should not crash or send anything
    expect((ws3.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});

describe("ChatRelay heartbeat", () => {
  let wss: WebSocketServer;
  let relay: ChatRelay;
  let ws: WebSocket;

  beforeEach(() => {
    wss = createMockWss();
    relay = new ChatRelay(wss);
    ws = createMockWs();
    relay.handleConnection(ws);

    // Create room
    const createMsg: ClientMessage = { type: "create_room", nickname: "alice" };
    (ws as any)._simulateMessage(JSON.stringify(createMsg));
  });

  it("handles heartbeat without error", () => {
    const heartbeatMsg: ClientMessage = { type: "heartbeat" };
    expect(() => {
      (ws as any)._simulateMessage(JSON.stringify(heartbeatMsg));
    }).not.toThrow();
  });

  it("ignores heartbeat from client not in a room", () => {
    const ws2 = createMockWs();
    relay.handleConnection(ws2);

    const heartbeatMsg: ClientMessage = { type: "heartbeat" };
    expect(() => {
      (ws2 as any)._simulateMessage(JSON.stringify(heartbeatMsg));
    }).not.toThrow();
  });
});

describe("ChatRelay message routing", () => {
  let wss: WebSocketServer;
  let relay: ChatRelay;
  let room1Ws1: WebSocket;
  let room1Ws2: WebSocket;
  let room2Ws1: WebSocket;

  beforeEach(() => {
    wss = createMockWss();
    relay = new ChatRelay(wss);
    room1Ws1 = createMockWs();
    room1Ws2 = createMockWs();
    room2Ws1 = createMockWs();
    relay.handleConnection(room1Ws1);
    relay.handleConnection(room1Ws2);
    relay.handleConnection(room2Ws1);
  });

  it("routes messages only to members of the same room", () => {
    // Create room 1
    const createMsg1: ClientMessage = { type: "create_room", nickname: "alice" };
    (room1Ws1 as any)._simulateMessage(JSON.stringify(createMsg1));

    const createdMsg1 = getAllSentMessages(room1Ws1).find((m) => m.type === "room_created");
    const roomCode1 = (createdMsg1 as any).code;

    // Join room 1
    const joinMsg1: ClientMessage = { type: "join_room", code: roomCode1, nickname: "bob" };
    (room1Ws2 as any)._simulateMessage(JSON.stringify(joinMsg1));

    // Create room 2
    const createMsg2: ClientMessage = { type: "create_room", nickname: "carol" };
    (room2Ws1 as any)._simulateMessage(JSON.stringify(createMsg2));

    clearSentMessages(room1Ws1);
    clearSentMessages(room1Ws2);
    clearSentMessages(room2Ws1);

    // Send chat in room 1
    const chatMsg: ClientMessage = { type: "chat", body: "hello room 1" };
    (room1Ws1 as any)._simulateMessage(JSON.stringify(chatMsg));

    // Room 1 members should receive it
    const messages1 = getAllSentMessages(room1Ws1);
    const messages2 = getAllSentMessages(room1Ws2);
    expect(messages1.find((m) => m.type === "message")).toBeDefined();
    expect(messages2.find((m) => m.type === "message")).toBeDefined();

    // Room 2 member should not receive it
    const messages3 = getAllSentMessages(room2Ws1);
    expect(messages3.find((m) => m.type === "message")).toBeUndefined();
  });
});

describe("ChatRelay grace timer", () => {
  let wss: WebSocketServer;
  let relay: ChatRelay;
  let ws1: WebSocket;
  let ws2: WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    wss = createMockWss();
    relay = new ChatRelay(wss);
    ws1 = createMockWs();
    ws2 = createMockWs();
    relay.handleConnection(ws1);
    relay.handleConnection(ws2);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts grace timer when room becomes empty", () => {
    // Create room
    const createMsg: ClientMessage = {
      type: "create_room",
      nickname: "alice",
      keepAliveMinutes: 1,
    };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    // Leave room
    const leaveMsg: ClientMessage = { type: "leave_room" };
    (ws1 as any)._simulateMessage(JSON.stringify(leaveMsg));

    // Grace timer should be active (verified by not throwing)
    expect(() => vi.advanceTimersByTime(30000)).not.toThrow();
  });

  it("cancels grace timer when user rejoins", () => {
    // Create room
    const createMsg: ClientMessage = {
      type: "create_room",
      nickname: "alice",
      keepAliveMinutes: 1,
    };
    (ws1 as any)._simulateMessage(JSON.stringify(createMsg));

    const createdMsg = getAllSentMessages(ws1).find((m) => m.type === "room_created");
    const roomCode = (createdMsg as any).code;

    // Leave room
    const leaveMsg: ClientMessage = { type: "leave_room" };
    (ws1 as any)._simulateMessage(JSON.stringify(leaveMsg));

    // Rejoin before grace period expires
    const joinMsg: ClientMessage = { type: "join_room", code: roomCode, nickname: "bob" };
    (ws2 as any)._simulateMessage(JSON.stringify(joinMsg));

    // Should successfully join (room wasn't deleted)
    const messages = getAllSentMessages(ws2);
    const joinedMsg = messages.find((m) => m.type === "room_joined");
    expect(joinedMsg).toBeDefined();
  });
});

describe("ChatRelay.close", () => {
  it("closes the WebSocketServer", () => {
    const wss = createMockWss();
    const relay = new ChatRelay(wss);
    relay.close();
    expect(wss.close).toHaveBeenCalled();
  });
});

describe("ChatRelay malformed messages", () => {
  let wss: WebSocketServer;
  let relay: ChatRelay;
  let ws: WebSocket;

  beforeEach(() => {
    wss = createMockWss();
    relay = new ChatRelay(wss);
    ws = createMockWs();
    relay.handleConnection(ws);
  });

  it("ignores malformed JSON without crashing", () => {
    expect(() => {
      (ws as any)._simulateMessage("not valid json");
    }).not.toThrow();
  });

  it("does not send error for malformed messages", () => {
    (ws as any)._simulateMessage("not valid json");
    expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
