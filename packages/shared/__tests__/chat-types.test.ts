import { describe, expect, it } from "vitest";
import type {
  AnyMessage,
  ChatMessage,
  ChatMessageType,
  ClientMessage,
  Member,
  ServerMessage,
  ShareAction,
  ShareMessage,
  SystemMessage,
} from "../src/chat-types.js";

describe("Chat message type unions", () => {
  it("validates ChatMessageType union", () => {
    const validTypes: ChatMessageType[] = ["chat", "share", "system"];
    expect(validTypes).toHaveLength(3);
  });

  it("validates ShareAction union", () => {
    const validActions: ShareAction[] = [
      "harness_updated",
      "plugin_installed",
      "plugin_uninstalled",
      "sync_applied",
      "permissions_changed",
      "preset_applied",
    ];
    expect(validActions).toHaveLength(6);
  });
});

describe("Message interfaces", () => {
  it("validates ChatMessage interface", () => {
    const message: ChatMessage = {
      id: "msg-1",
      roomCode: "ABC123",
      type: "chat",
      nickname: "testuser",
      timestamp: "2024-01-01T00:00:00Z",
      body: "Hello, world!",
    };
    expect(message.type).toBe("chat");
    expect(message.body).toBe("Hello, world!");
  });

  it("validates ShareMessage interface with all fields", () => {
    const message: ShareMessage = {
      id: "msg-2",
      roomCode: "ABC123",
      type: "share",
      nickname: "testuser",
      timestamp: "2024-01-01T00:00:00Z",
      action: "plugin_installed",
      target: "research@harness-kit",
      detail: "v1.0.0",
      diff: "plugin.json content...",
      pullable: true,
    };
    expect(message.type).toBe("share");
    expect(message.action).toBe("plugin_installed");
    expect(message.pullable).toBe(true);
  });

  it("validates ShareMessage interface with null fields", () => {
    const message: ShareMessage = {
      id: "msg-3",
      roomCode: "ABC123",
      type: "share",
      nickname: "testuser",
      timestamp: "2024-01-01T00:00:00Z",
      action: "harness_updated",
      target: "harness.yaml",
      detail: null,
      diff: null,
      pullable: false,
    };
    expect(message.detail).toBeNull();
    expect(message.diff).toBeNull();
  });

  it("validates SystemMessage interface with join event", () => {
    const message: SystemMessage = {
      id: "msg-4",
      roomCode: "ABC123",
      type: "system",
      nickname: "testuser",
      timestamp: "2024-01-01T00:00:00Z",
      event: "join",
      detail: "joined the room",
    };
    expect(message.type).toBe("system");
    expect(message.event).toBe("join");
  });

  it("validates SystemMessage interface with leave event", () => {
    const message: SystemMessage = {
      id: "msg-5",
      roomCode: "ABC123",
      type: "system",
      nickname: "testuser",
      timestamp: "2024-01-01T00:00:00Z",
      event: "leave",
      detail: null,
    };
    expect(message.event).toBe("leave");
    expect(message.detail).toBeNull();
  });

  it("validates SystemMessage interface with all event types", () => {
    const events: Array<"join" | "leave" | "nick_change" | "room_created" | "shutdown"> = [
      "join",
      "leave",
      "nick_change",
      "room_created",
      "shutdown",
    ];
    expect(events).toHaveLength(5);
  });

  it("validates AnyMessage union with ChatMessage", () => {
    const message: AnyMessage = {
      id: "msg-6",
      roomCode: "ABC123",
      type: "chat",
      nickname: "testuser",
      timestamp: "2024-01-01T00:00:00Z",
      body: "Test",
    };
    expect(message.type).toBe("chat");
  });

  it("validates AnyMessage union with ShareMessage", () => {
    const message: AnyMessage = {
      id: "msg-7",
      roomCode: "ABC123",
      type: "share",
      nickname: "testuser",
      timestamp: "2024-01-01T00:00:00Z",
      action: "sync_applied",
      target: "config",
      detail: null,
      diff: null,
      pullable: false,
    };
    expect(message.type).toBe("share");
  });

  it("validates AnyMessage union with SystemMessage", () => {
    const message: AnyMessage = {
      id: "msg-8",
      roomCode: "ABC123",
      type: "system",
      nickname: "testuser",
      timestamp: "2024-01-01T00:00:00Z",
      event: "room_created",
      detail: "Room created",
    };
    expect(message.type).toBe("system");
  });
});

describe("Relay protocol types", () => {
  it("validates Member interface", () => {
    const member: Member = {
      nickname: "testuser",
      joinedAt: "2024-01-01T00:00:00Z",
      typing: false,
    };
    expect(member.nickname).toBe("testuser");
    expect(member.typing).toBe(false);
  });

  it("validates Member interface with typing indicator", () => {
    const member: Member = {
      nickname: "testuser",
      joinedAt: "2024-01-01T00:00:00Z",
      typing: true,
    };
    expect(member.typing).toBe(true);
  });
});

describe("ClientMessage discriminated union", () => {
  it("validates create_room message with all fields", () => {
    const message: ClientMessage = {
      type: "create_room",
      name: "Dev Team",
      nickname: "testuser",
      keepAliveMinutes: 60,
    };
    expect(message.type).toBe("create_room");
    expect(message.keepAliveMinutes).toBe(60);
  });

  it("validates create_room message with minimal fields", () => {
    const message: ClientMessage = {
      type: "create_room",
      nickname: "testuser",
    };
    expect(message.type).toBe("create_room");
  });

  it("validates join_room message", () => {
    const message: ClientMessage = {
      type: "join_room",
      code: "ABC123",
      nickname: "testuser",
    };
    expect(message.type).toBe("join_room");
    expect(message.code).toBe("ABC123");
  });

  it("validates leave_room message", () => {
    const message: ClientMessage = {
      type: "leave_room",
    };
    expect(message.type).toBe("leave_room");
  });

  it("validates chat message", () => {
    const message: ClientMessage = {
      type: "chat",
      body: "Hello!",
    };
    expect(message.type).toBe("chat");
    expect(message.body).toBe("Hello!");
  });

  it("validates share message with all fields", () => {
    const message: ClientMessage = {
      type: "share",
      action: "plugin_installed",
      target: "research@harness-kit",
      detail: "v1.0.0",
      diff: "plugin content...",
      pullable: true,
    };
    expect(message.type).toBe("share");
    expect(message.pullable).toBe(true);
  });

  it("validates share message with minimal fields", () => {
    const message: ClientMessage = {
      type: "share",
      action: "harness_updated",
      target: "harness.yaml",
    };
    expect(message.type).toBe("share");
  });

  it("validates typing message", () => {
    const message: ClientMessage = {
      type: "typing",
      typing: true,
    };
    expect(message.type).toBe("typing");
    expect(message.typing).toBe(true);
  });

  it("validates heartbeat message", () => {
    const message: ClientMessage = {
      type: "heartbeat",
    };
    expect(message.type).toBe("heartbeat");
  });
});

describe("ServerMessage discriminated union", () => {
  it("validates room_created message with name", () => {
    const message: ServerMessage = {
      type: "room_created",
      code: "ABC123",
      name: "Dev Team",
    };
    expect(message.type).toBe("room_created");
    expect(message.name).toBe("Dev Team");
  });

  it("validates room_created message without name", () => {
    const message: ServerMessage = {
      type: "room_created",
      code: "ABC123",
    };
    expect(message.type).toBe("room_created");
  });

  it("validates room_joined message", () => {
    const message: ServerMessage = {
      type: "room_joined",
      code: "ABC123",
      name: "Dev Team",
      members: [
        { nickname: "user1", joinedAt: "2024-01-01T00:00:00Z", typing: false },
        { nickname: "user2", joinedAt: "2024-01-01T00:01:00Z", typing: true },
      ],
      history: [
        {
          id: "msg-1",
          roomCode: "ABC123",
          type: "chat",
          nickname: "user1",
          timestamp: "2024-01-01T00:00:00Z",
          body: "Hello",
        },
      ],
    };
    expect(message.type).toBe("room_joined");
    expect(message.members).toHaveLength(2);
    expect(message.history).toHaveLength(1);
  });

  it("validates room_error message", () => {
    const message: ServerMessage = {
      type: "room_error",
      error: "Room not found",
    };
    expect(message.type).toBe("room_error");
    expect(message.error).toBe("Room not found");
  });

  it("validates message wrapper", () => {
    const message: ServerMessage = {
      type: "message",
      message: {
        id: "msg-1",
        roomCode: "ABC123",
        type: "chat",
        nickname: "testuser",
        timestamp: "2024-01-01T00:00:00Z",
        body: "Hello",
      },
    };
    expect(message.type).toBe("message");
    expect(message.message.type).toBe("chat");
  });

  it("validates presence update message", () => {
    const message: ServerMessage = {
      type: "presence",
      members: [
        { nickname: "user1", joinedAt: "2024-01-01T00:00:00Z", typing: false },
        { nickname: "user2", joinedAt: "2024-01-01T00:01:00Z", typing: false },
      ],
    };
    expect(message.type).toBe("presence");
    expect(message.members).toHaveLength(2);
  });

  it("validates typing_update message", () => {
    const message: ServerMessage = {
      type: "typing_update",
      nickname: "testuser",
      typing: true,
    };
    expect(message.type).toBe("typing_update");
    expect(message.typing).toBe(true);
  });
});
