import { describe, expect, it } from "vitest";
import type {
  AnyMessage,
  ChatMessage,
  ClientMessage,
  Member,
  ServerMessage,
  ShareAction,
  ShareMessage,
  SystemMessage,
} from "../protocol.js";

describe("ClientMessage serialization", () => {
  it("serializes create_room message without optional fields", () => {
    const msg: ClientMessage = {
      type: "create_room",
      nickname: "alice",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect(parsed.type).toBe("create_room");
    expect((parsed as Extract<ClientMessage, { type: "create_room" }>).nickname).toBe("alice");
  });

  it("serializes create_room message with all optional fields", () => {
    const msg: ClientMessage = {
      type: "create_room",
      nickname: "alice",
      name: "My Room",
      keepAliveMinutes: 10,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect(parsed.type).toBe("create_room");
    expect((parsed as Extract<ClientMessage, { type: "create_room" }>).nickname).toBe("alice");
    expect((parsed as Extract<ClientMessage, { type: "create_room" }>).name).toBe("My Room");
    expect((parsed as Extract<ClientMessage, { type: "create_room" }>).keepAliveMinutes).toBe(10);
  });

  it("serializes join_room message", () => {
    const msg: ClientMessage = {
      type: "join_room",
      code: "ABC-123",
      nickname: "bob",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect(parsed.type).toBe("join_room");
    expect((parsed as Extract<ClientMessage, { type: "join_room" }>).code).toBe("ABC-123");
    expect((parsed as Extract<ClientMessage, { type: "join_room" }>).nickname).toBe("bob");
  });

  it("serializes leave_room message", () => {
    const msg: ClientMessage = { type: "leave_room" };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect(parsed.type).toBe("leave_room");
  });

  it("serializes chat message", () => {
    const msg: ClientMessage = {
      type: "chat",
      body: "Hello, world!",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect(parsed.type).toBe("chat");
    expect((parsed as Extract<ClientMessage, { type: "chat" }>).body).toBe("Hello, world!");
  });

  it("serializes share message without optional fields", () => {
    const msg: ClientMessage = {
      type: "share",
      action: "harness_updated",
      target: "harness.yaml",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect(parsed.type).toBe("share");
    expect((parsed as Extract<ClientMessage, { type: "share" }>).action).toBe("harness_updated");
    expect((parsed as Extract<ClientMessage, { type: "share" }>).target).toBe("harness.yaml");
  });

  it("serializes share message with all optional fields", () => {
    const msg: ClientMessage = {
      type: "share",
      action: "plugin_installed",
      target: "research",
      detail: "Added research plugin",
      diff: "+plugin: research",
      pullable: true,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect(parsed.type).toBe("share");
    const shareMsg = parsed as Extract<ClientMessage, { type: "share" }>;
    expect(shareMsg.action).toBe("plugin_installed");
    expect(shareMsg.target).toBe("research");
    expect(shareMsg.detail).toBe("Added research plugin");
    expect(shareMsg.diff).toBe("+plugin: research");
    expect(shareMsg.pullable).toBe(true);
  });

  it("serializes typing message", () => {
    const msg: ClientMessage = {
      type: "typing",
      typing: true,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect(parsed.type).toBe("typing");
    expect((parsed as Extract<ClientMessage, { type: "typing" }>).typing).toBe(true);
  });

  it("serializes heartbeat message", () => {
    const msg: ClientMessage = { type: "heartbeat" };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect(parsed.type).toBe("heartbeat");
  });
});

describe("ServerMessage serialization", () => {
  it("serializes room_created message without optional fields", () => {
    const msg: ServerMessage = {
      type: "room_created",
      code: "ABC-123",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;

    expect(parsed.type).toBe("room_created");
    expect((parsed as Extract<ServerMessage, { type: "room_created" }>).code).toBe("ABC-123");
  });

  it("serializes room_created message with name", () => {
    const msg: ServerMessage = {
      type: "room_created",
      code: "ABC-123",
      name: "My Room",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;

    expect(parsed.type).toBe("room_created");
    expect((parsed as Extract<ServerMessage, { type: "room_created" }>).code).toBe("ABC-123");
    expect((parsed as Extract<ServerMessage, { type: "room_created" }>).name).toBe("My Room");
  });

  it("serializes room_joined message", () => {
    const members: Member[] = [
      { nickname: "alice", joinedAt: "2024-01-01T00:00:00Z", typing: false },
      { nickname: "bob", joinedAt: "2024-01-01T00:01:00Z", typing: true },
    ];
    const history: AnyMessage[] = [];

    const msg: ServerMessage = {
      type: "room_joined",
      code: "ABC-123",
      name: "Test Room",
      members,
      history,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;

    expect(parsed.type).toBe("room_joined");
    const joinedMsg = parsed as Extract<ServerMessage, { type: "room_joined" }>;
    expect(joinedMsg.code).toBe("ABC-123");
    expect(joinedMsg.name).toBe("Test Room");
    expect(joinedMsg.members).toHaveLength(2);
    expect(joinedMsg.members[0].nickname).toBe("alice");
    expect(joinedMsg.members[1].typing).toBe(true);
    expect(joinedMsg.history).toHaveLength(0);
  });

  it("serializes room_error message", () => {
    const msg: ServerMessage = {
      type: "room_error",
      error: "Nickname already taken",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;

    expect(parsed.type).toBe("room_error");
    expect((parsed as Extract<ServerMessage, { type: "room_error" }>).error).toBe(
      "Nickname already taken",
    );
  });

  it("serializes message wrapper with ChatMessage", () => {
    const chatMsg: ChatMessage = {
      id: "msg-123",
      roomCode: "ABC-123",
      type: "chat",
      nickname: "alice",
      timestamp: "2024-01-01T00:00:00Z",
      body: "Hello!",
    };

    const msg: ServerMessage = {
      type: "message",
      message: chatMsg,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;

    expect(parsed.type).toBe("message");
    const messageWrapper = parsed as Extract<ServerMessage, { type: "message" }>;
    expect(messageWrapper.message.type).toBe("chat");
    expect((messageWrapper.message as ChatMessage).body).toBe("Hello!");
  });

  it("serializes presence message", () => {
    const members: Member[] = [
      { nickname: "alice", joinedAt: "2024-01-01T00:00:00Z", typing: false },
    ];

    const msg: ServerMessage = {
      type: "presence",
      members,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;

    expect(parsed.type).toBe("presence");
    expect((parsed as Extract<ServerMessage, { type: "presence" }>).members).toHaveLength(1);
    expect((parsed as Extract<ServerMessage, { type: "presence" }>).members[0].nickname).toBe(
      "alice",
    );
  });

  it("serializes typing_update message", () => {
    const msg: ServerMessage = {
      type: "typing_update",
      nickname: "bob",
      typing: true,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;

    expect(parsed.type).toBe("typing_update");
    const typingMsg = parsed as Extract<ServerMessage, { type: "typing_update" }>;
    expect(typingMsg.nickname).toBe("bob");
    expect(typingMsg.typing).toBe(true);
  });
});

describe("AnyMessage serialization", () => {
  it("serializes ChatMessage", () => {
    const msg: ChatMessage = {
      id: "msg-123",
      roomCode: "ABC-123",
      type: "chat",
      nickname: "alice",
      timestamp: "2024-01-01T00:00:00Z",
      body: "Hello, world!",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ChatMessage;

    expect(parsed.id).toBe("msg-123");
    expect(parsed.roomCode).toBe("ABC-123");
    expect(parsed.type).toBe("chat");
    expect(parsed.nickname).toBe("alice");
    expect(parsed.timestamp).toBe("2024-01-01T00:00:00Z");
    expect(parsed.body).toBe("Hello, world!");
  });

  it("serializes ShareMessage with all fields", () => {
    const msg: ShareMessage = {
      id: "msg-456",
      roomCode: "ABC-123",
      type: "share",
      nickname: "bob",
      timestamp: "2024-01-01T00:01:00Z",
      action: "harness_updated",
      target: "harness.yaml",
      detail: "Updated plugins section",
      diff: "+  - research",
      pullable: true,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ShareMessage;

    expect(parsed.id).toBe("msg-456");
    expect(parsed.roomCode).toBe("ABC-123");
    expect(parsed.type).toBe("share");
    expect(parsed.nickname).toBe("bob");
    expect(parsed.timestamp).toBe("2024-01-01T00:01:00Z");
    expect(parsed.action).toBe("harness_updated");
    expect(parsed.target).toBe("harness.yaml");
    expect(parsed.detail).toBe("Updated plugins section");
    expect(parsed.diff).toBe("+  - research");
    expect(parsed.pullable).toBe(true);
  });

  it("serializes ShareMessage with null optional fields", () => {
    const msg: ShareMessage = {
      id: "msg-789",
      roomCode: "ABC-123",
      type: "share",
      nickname: "carol",
      timestamp: "2024-01-01T00:02:00Z",
      action: "permissions_changed",
      target: "settings",
      detail: null,
      diff: null,
      pullable: false,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ShareMessage;

    expect(parsed.detail).toBeNull();
    expect(parsed.diff).toBeNull();
    expect(parsed.pullable).toBe(false);
  });

  it("serializes SystemMessage with join event", () => {
    const msg: SystemMessage = {
      id: "sys-123",
      roomCode: "ABC-123",
      type: "system",
      nickname: "alice",
      timestamp: "2024-01-01T00:00:00Z",
      event: "join",
      detail: null,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as SystemMessage;

    expect(parsed.id).toBe("sys-123");
    expect(parsed.roomCode).toBe("ABC-123");
    expect(parsed.type).toBe("system");
    expect(parsed.nickname).toBe("alice");
    expect(parsed.event).toBe("join");
    expect(parsed.detail).toBeNull();
  });

  it("serializes SystemMessage with all event types", () => {
    const events: Array<SystemMessage["event"]> = [
      "join",
      "leave",
      "nick_change",
      "room_created",
      "shutdown",
    ];

    for (const event of events) {
      const msg: SystemMessage = {
        id: `sys-${event}`,
        roomCode: "ABC-123",
        type: "system",
        nickname: "alice",
        timestamp: "2024-01-01T00:00:00Z",
        event,
        detail: null,
      };
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json) as SystemMessage;

      expect(parsed.event).toBe(event);
    }
  });
});

describe("ShareAction validation", () => {
  it("serializes all ShareAction variants", () => {
    const actions: ShareAction[] = [
      "harness_updated",
      "plugin_installed",
      "plugin_uninstalled",
      "sync_applied",
      "permissions_changed",
      "preset_applied",
    ];

    for (const action of actions) {
      const msg: ClientMessage = {
        type: "share",
        action,
        target: "test",
      };
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json) as ClientMessage;

      expect((parsed as Extract<ClientMessage, { type: "share" }>).action).toBe(action);
    }
  });
});

describe("Member serialization", () => {
  it("serializes Member object", () => {
    const member: Member = {
      nickname: "alice",
      joinedAt: "2024-01-01T00:00:00Z",
      typing: false,
    };
    const json = JSON.stringify(member);
    const parsed = JSON.parse(json) as Member;

    expect(parsed.nickname).toBe("alice");
    expect(parsed.joinedAt).toBe("2024-01-01T00:00:00Z");
    expect(parsed.typing).toBe(false);
  });

  it("serializes Member array", () => {
    const members: Member[] = [
      { nickname: "alice", joinedAt: "2024-01-01T00:00:00Z", typing: false },
      { nickname: "bob", joinedAt: "2024-01-01T00:01:00Z", typing: true },
      { nickname: "carol", joinedAt: "2024-01-01T00:02:00Z", typing: false },
    ];
    const json = JSON.stringify(members);
    const parsed = JSON.parse(json) as Member[];

    expect(parsed).toHaveLength(3);
    expect(parsed[0].nickname).toBe("alice");
    expect(parsed[1].typing).toBe(true);
    expect(parsed[2].joinedAt).toBe("2024-01-01T00:02:00Z");
  });
});

describe("Protocol edge cases", () => {
  it("handles empty strings in message bodies", () => {
    const msg: ClientMessage = {
      type: "chat",
      body: "",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect((parsed as Extract<ClientMessage, { type: "chat" }>).body).toBe("");
  });

  it("handles special characters in nicknames", () => {
    const msg: ClientMessage = {
      type: "create_room",
      nickname: "alice_123-🎉",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect((parsed as Extract<ClientMessage, { type: "create_room" }>).nickname).toBe(
      "alice_123-🎉",
    );
  });

  it("handles multiline text in chat body", () => {
    const body = "Line 1\nLine 2\nLine 3";
    const msg: ClientMessage = {
      type: "chat",
      body,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect((parsed as Extract<ClientMessage, { type: "chat" }>).body).toBe(body);
  });

  it("handles large diff in share message", () => {
    const diff = "- old line\n+ new line\n".repeat(100);
    const msg: ClientMessage = {
      type: "share",
      action: "harness_updated",
      target: "harness.yaml",
      diff,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ClientMessage;

    expect((parsed as Extract<ClientMessage, { type: "share" }>).diff).toBe(diff);
  });

  it("handles room code with various formats", () => {
    const codes = ["ABC-123", "XYZ-999", "AAA-000"];

    for (const code of codes) {
      const msg: ServerMessage = {
        type: "room_created",
        code,
      };
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json) as ServerMessage;

      expect((parsed as Extract<ServerMessage, { type: "room_created" }>).code).toBe(code);
    }
  });

  it("preserves ISO 8601 timestamp format", () => {
    const timestamp = "2024-01-01T12:34:56.789Z";
    const msg: ChatMessage = {
      id: "msg-123",
      roomCode: "ABC-123",
      type: "chat",
      nickname: "alice",
      timestamp,
      body: "test",
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ChatMessage;

    expect(parsed.timestamp).toBe(timestamp);
  });

  it("handles empty members array", () => {
    const msg: ServerMessage = {
      type: "presence",
      members: [],
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;

    expect((parsed as Extract<ServerMessage, { type: "presence" }>).members).toHaveLength(0);
  });

  it("handles empty history array", () => {
    const msg: ServerMessage = {
      type: "room_joined",
      code: "ABC-123",
      members: [],
      history: [],
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;

    expect((parsed as Extract<ServerMessage, { type: "room_joined" }>).history).toHaveLength(0);
  });

  it("handles long error messages", () => {
    const error = "Error: ".repeat(50);
    const msg: ServerMessage = {
      type: "room_error",
      error,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;

    expect((parsed as Extract<ServerMessage, { type: "room_error" }>).error).toBe(error);
  });
});

describe("Protocol message roundtrip", () => {
  it("preserves all ClientMessage types through serialization", () => {
    const messages: ClientMessage[] = [
      { type: "create_room", nickname: "alice", name: "Test", keepAliveMinutes: 5 },
      { type: "join_room", code: "ABC-123", nickname: "bob" },
      { type: "leave_room" },
      { type: "chat", body: "Hello!" },
      { type: "share", action: "harness_updated", target: "test", detail: "detail", diff: "diff" },
      { type: "typing", typing: true },
      { type: "heartbeat" },
    ];

    for (const msg of messages) {
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json) as ClientMessage;
      expect(parsed.type).toBe(msg.type);
    }
  });

  it("preserves all ServerMessage types through serialization", () => {
    const chatMsg: ChatMessage = {
      id: "1",
      roomCode: "ABC-123",
      type: "chat",
      nickname: "alice",
      timestamp: "2024-01-01T00:00:00Z",
      body: "test",
    };

    const messages: ServerMessage[] = [
      { type: "room_created", code: "ABC-123", name: "Test" },
      { type: "room_joined", code: "ABC-123", members: [], history: [] },
      { type: "room_error", error: "Error" },
      { type: "message", message: chatMsg },
      { type: "presence", members: [] },
      { type: "typing_update", nickname: "bob", typing: false },
    ];

    for (const msg of messages) {
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json) as ServerMessage;
      expect(parsed.type).toBe(msg.type);
    }
  });

  it("preserves complex nested message structures", () => {
    const history: AnyMessage[] = [
      {
        id: "msg-1",
        roomCode: "ABC-123",
        type: "chat",
        nickname: "alice",
        timestamp: "2024-01-01T00:00:00Z",
        body: "Hello!",
      },
      {
        id: "msg-2",
        roomCode: "ABC-123",
        type: "share",
        nickname: "bob",
        timestamp: "2024-01-01T00:01:00Z",
        action: "plugin_installed",
        target: "research",
        detail: "Added research plugin",
        diff: null,
        pullable: true,
      },
      {
        id: "sys-1",
        roomCode: "ABC-123",
        type: "system",
        nickname: "carol",
        timestamp: "2024-01-01T00:02:00Z",
        event: "join",
        detail: null,
      },
    ];

    const members: Member[] = [
      { nickname: "alice", joinedAt: "2024-01-01T00:00:00Z", typing: false },
      { nickname: "bob", joinedAt: "2024-01-01T00:01:00Z", typing: true },
      { nickname: "carol", joinedAt: "2024-01-01T00:02:00Z", typing: false },
    ];

    const msg: ServerMessage = {
      type: "room_joined",
      code: "ABC-123",
      name: "Test Room",
      members,
      history,
    };

    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ServerMessage;
    const joinedMsg = parsed as Extract<ServerMessage, { type: "room_joined" }>;

    expect(joinedMsg.members).toHaveLength(3);
    expect(joinedMsg.history).toHaveLength(3);
    expect(joinedMsg.history[0].type).toBe("chat");
    expect(joinedMsg.history[1].type).toBe("share");
    expect(joinedMsg.history[2].type).toBe("system");
  });
});
