import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnyMessage, Member, ServerMessage } from "../protocol.js";
import { Room } from "../room.js";

// ── WebSocket mock ────────────────────────────────────────────
//
// The `ws` package's WebSocket is imported by room.ts for its OPEN constant.
// We mock the module so tests don't need a real network stack.

vi.mock("ws", () => {
  const OPEN = 1;
  const MockWebSocket = vi.fn().mockImplementation(() => ({
    readyState: OPEN,
    send: vi.fn(),
  }));
  (MockWebSocket as unknown as Record<string, number>).OPEN = OPEN;
  return { WebSocket: MockWebSocket };
});

// Helper: create a fake socket whose readyState is OPEN (1)
function makeFakeSocket(readyState: number = 1): {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
} {
  return { readyState, send: vi.fn() };
}

// Helper: create a basic Member object
function makeMember(nickname: string): Member {
  return { nickname, joinedAt: new Date().toISOString(), typing: false };
}

// Helper: make a simple chat ServerMessage
function makeChatMsg(): ServerMessage {
  return {
    type: "message",
    message: {
      id: "msg-1",
      roomCode: "TESTROOM",
      type: "chat",
      nickname: "alice",
      timestamp: new Date().toISOString(),
      body: "hello",
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("Room constructor", () => {
  it("sets code and name correctly", () => {
    const room = new Room("ABCD", "test-room");
    expect(room.code).toBe("ABCD");
    expect(room.name).toBe("test-room");
  });

  it("defaults name to null when not provided", () => {
    const room = new Room("ABCD");
    expect(room.name).toBeNull();
  });

  it("starts with an empty members map", () => {
    const room = new Room("ABCD");
    expect(room.members.size).toBe(0);
  });

  it("isEmpty() returns true on a new room", () => {
    const room = new Room("ABCD");
    expect(room.isEmpty()).toBe(true);
  });
});

describe("Room.addMember", () => {
  it("stores the member and isEmpty() becomes false", () => {
    const room = new Room("ABCD");
    const ws = makeFakeSocket();
    const member = makeMember("alice");
    room.addMember(ws as never, member);
    expect(room.members.size).toBe(1);
    expect(room.isEmpty()).toBe(false);
  });
});

describe("Room.removeMember", () => {
  it("removes the member and returns it", () => {
    const room = new Room("ABCD");
    const ws = makeFakeSocket();
    const member = makeMember("alice");
    room.addMember(ws as never, member);

    const removed = room.removeMember(ws as never);
    expect(removed).toBe(member);
    expect(room.members.size).toBe(0);
  });

  it("isEmpty() returns true after the last member is removed", () => {
    const room = new Room("ABCD");
    const ws = makeFakeSocket();
    room.addMember(ws as never, makeMember("alice"));
    room.removeMember(ws as never);
    expect(room.isEmpty()).toBe(true);
  });

  it("returns undefined when removing an unknown socket", () => {
    const room = new Room("ABCD");
    const ws = makeFakeSocket();
    expect(room.removeMember(ws as never)).toBeUndefined();
  });
});

describe("Room.getMemberByNickname", () => {
  it("finds a member by nickname", () => {
    const room = new Room("ABCD");
    const ws = makeFakeSocket();
    const member = makeMember("alice");
    room.addMember(ws as never, member);

    const result = room.getMemberByNickname("alice");
    expect(result).toBeDefined();
    expect(result![1]).toBe(member);
    expect(result![0]).toBe(ws);
  });

  it("returns undefined for an unknown nickname", () => {
    const room = new Room("ABCD");
    expect(room.getMemberByNickname("nobody")).toBeUndefined();
  });
});

describe("Room.broadcast", () => {
  let room: Room;
  let ws1: ReturnType<typeof makeFakeSocket>;
  let ws2: ReturnType<typeof makeFakeSocket>;
  let ws3: ReturnType<typeof makeFakeSocket>;

  beforeEach(() => {
    room = new Room("ABCD");
    ws1 = makeFakeSocket(1); // OPEN
    ws2 = makeFakeSocket(1); // OPEN
    ws3 = makeFakeSocket(1); // OPEN
    room.addMember(ws1 as never, makeMember("alice"));
    room.addMember(ws2 as never, makeMember("bob"));
    room.addMember(ws3 as never, makeMember("carol"));
  });

  it("sends to all OPEN members", () => {
    const msg = makeChatMsg();
    room.broadcast(msg);
    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).toHaveBeenCalledOnce();
    expect(ws3.send).toHaveBeenCalledOnce();
  });

  it("skips the excluded member", () => {
    const msg = makeChatMsg();
    room.broadcast(msg, ws1 as never);
    expect(ws1.send).not.toHaveBeenCalled();
    expect(ws2.send).toHaveBeenCalledOnce();
    expect(ws3.send).toHaveBeenCalledOnce();
  });

  it("skips non-OPEN sockets (readyState !== 1)", () => {
    const closedWs = makeFakeSocket(3); // CLOSED
    room.addMember(closedWs as never, makeMember("dave"));

    const msg = makeChatMsg();
    room.broadcast(msg);
    expect(closedWs.send).not.toHaveBeenCalled();
  });

  it("sends JSON-serialised payload", () => {
    const msg = makeChatMsg();
    room.broadcast(msg);
    expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });
});

describe("Room.messages ring buffer", () => {
  it("stores pushed messages and returns them via toArray()", () => {
    const room = new Room("ABCD");
    const msgA: AnyMessage = {
      id: "1",
      roomCode: "ABCD",
      type: "chat",
      nickname: "alice",
      timestamp: new Date().toISOString(),
      body: "hello",
    };
    const msgB: AnyMessage = {
      id: "2",
      roomCode: "ABCD",
      type: "chat",
      nickname: "bob",
      timestamp: new Date().toISOString(),
      body: "hi",
    };
    room.messages.push(msgA);
    room.messages.push(msgB);
    const arr = room.messages.toArray();
    expect(arr).toHaveLength(2);
    expect(arr[0]).toBe(msgA);
    expect(arr[1]).toBe(msgB);
  });

  it("evicts oldest message when capacity (500) is exceeded", () => {
    const room = new Room("ABCD");
    // Push 501 messages; first one should be evicted
    for (let i = 0; i < 501; i++) {
      room.messages.push({
        id: String(i),
        roomCode: "ABCD",
        type: "chat",
        nickname: "tester",
        timestamp: new Date().toISOString(),
        body: `msg-${i}`,
      });
    }
    const arr = room.messages.toArray();
    expect(arr).toHaveLength(500);
    expect(arr[0].id).toBe("1"); // id "0" was evicted
    expect(arr[499].id).toBe("500");
  });
});
