import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientMessage, Member, ServerMessage, SystemMessage } from "./protocol.js";
import { Room } from "./room.js";

const GRACE_PERIOD_MS = 300_000; // 5 minutes

// Uppercase consonants only — avoids forming recognisable words
const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomChar(alphabet: string): string {
  return alphabet[Math.floor(Math.random() * alphabet.length)];
}

function generateRoomCode(): string {
  const prefix = Array.from({ length: 3 }, () => randomChar(CONSONANTS)).join("");
  const suffix = Array.from({ length: 3 }, () => randomChar(ALPHANUMERIC)).join("");
  return `${prefix}-${suffix}`;
}

export class ChatRelay {
  private rooms: Map<string, Room>;
  private clientState: Map<WebSocket, { room: Room; member: Member }>;

  constructor(private readonly wss: WebSocketServer) {
    this.rooms = new Map();
    this.clientState = new Map();

    wss.on("connection", (ws: WebSocket) => {
      this.handleConnection(ws);
    });
  }

  handleConnection(ws: WebSocket): void {
    ws.on("message", (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        console.warn("[chat-relay] malformed message — ignoring");
        return;
      }
      this.handleMessage(ws, msg);
    });

    ws.on("close", () => {
      this.handleDisconnect(ws);
    });

    ws.on("error", (err) => {
      console.error("[chat-relay] client error:", err);
    });
  }

  private handleMessage(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case "create_room":
        this.handleCreateRoom(ws, msg.nickname, msg.name);
        break;
      case "join_room":
        this.handleJoinRoom(ws, msg.code, msg.nickname);
        break;
      case "leave_room":
        this.handleLeaveRoom(ws);
        break;
      case "chat":
        this.handleChat(ws, msg.body);
        break;
      case "share":
        this.handleShare(ws, msg);
        break;
      case "typing":
        this.handleTyping(ws, msg.typing);
        break;
      case "heartbeat":
        this.handleHeartbeat(ws);
        break;
      default: {
        const _exhaustive: never = msg;
        console.warn("[chat-relay] unknown message type:", (_exhaustive as ClientMessage));
      }
    }
  }

  private handleCreateRoom(ws: WebSocket, nickname: string, name?: string): void {
    // Generate a unique code, retrying on collision
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const room = new Room(code, name);
    this.rooms.set(code, room);

    const createdMsg: ServerMessage = { type: "room_created", code, ...(name ? { name } : {}) };
    room.send(ws, createdMsg);

    // Immediately join the creator
    this.handleJoinRoom(ws, code, nickname);
  }

  private handleJoinRoom(ws: WebSocket, code: string, nickname: string): void {
    const room = this.rooms.get(code);
    if (!room) {
      const errMsg: ServerMessage = { type: "room_error", error: `Room ${code} does not exist` };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(errMsg));
      }
      return;
    }

    if (room.getMemberByNickname(nickname)) {
      const errMsg: ServerMessage = {
        type: "room_error",
        error: `Nickname "${nickname}" is already taken in this room`,
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(errMsg));
      }
      return;
    }

    // Cancel grace timer if room was empty
    if (room.graceTimer !== null) {
      clearTimeout(room.graceTimer);
      room.graceTimer = null;
    }

    const member: Member = {
      nickname,
      joinedAt: new Date().toISOString(),
      typing: false,
    };

    room.addMember(ws, member);
    this.clientState.set(ws, { room, member });

    // Send room_joined to the new member (with history + current member list)
    const joinedMsg: ServerMessage = {
      type: "room_joined",
      code,
      ...(room.name ? { name: room.name } : {}),
      members: Array.from(room.members.values()),
      history: room.messages.toArray(),
    };
    room.send(ws, joinedMsg);

    // Record and broadcast the join system message to existing members
    const sysMsg: SystemMessage = {
      id: randomUUID(),
      roomCode: code,
      type: "system",
      nickname,
      timestamp: new Date().toISOString(),
      event: "join",
      detail: null,
    };
    room.messages.push(sysMsg);
    room.broadcast({ type: "message", message: sysMsg }, ws);

    // Broadcast updated presence to all members (including the new one)
    this.broadcastPresence(room);
  }

  private handleLeaveRoom(ws: WebSocket): void {
    const state = this.clientState.get(ws);
    if (!state) return;

    const { room, member } = state;
    this.clientState.delete(ws);
    room.removeMember(ws);

    // Broadcast leave system message
    const sysMsg: SystemMessage = {
      id: randomUUID(),
      roomCode: room.code,
      type: "system",
      nickname: member.nickname,
      timestamp: new Date().toISOString(),
      event: "leave",
      detail: null,
    };
    room.messages.push(sysMsg);
    room.broadcast({ type: "message", message: sysMsg });

    // Broadcast updated presence
    this.broadcastPresence(room);

    // Start grace timer if room is now empty
    if (room.isEmpty()) {
      this.startGraceTimer(room);
    }
  }

  private handleChat(ws: WebSocket, body: string): void {
    const state = this.clientState.get(ws);
    if (!state) {
      console.warn("[chat-relay] chat message from client not in a room — ignoring");
      return;
    }

    const { room, member } = state;
    const chatMsg = {
      id: randomUUID(),
      roomCode: room.code,
      type: "chat" as const,
      nickname: member.nickname,
      timestamp: new Date().toISOString(),
      body,
    };

    room.messages.push(chatMsg);
    room.broadcast({ type: "message", message: chatMsg });
    room.lastActivity = new Date();
  }

  private handleShare(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: "share" }>
  ): void {
    const state = this.clientState.get(ws);
    if (!state) {
      console.warn("[chat-relay] share message from client not in a room — ignoring");
      return;
    }

    const { room, member } = state;
    const shareMsg = {
      id: randomUUID(),
      roomCode: room.code,
      type: "share" as const,
      nickname: member.nickname,
      timestamp: new Date().toISOString(),
      action: msg.action,
      target: msg.target,
      detail: msg.detail ?? null,
      diff: msg.diff ?? null,
      pullable: msg.pullable ?? true,
    };

    room.messages.push(shareMsg);
    room.broadcast({ type: "message", message: shareMsg });
    room.lastActivity = new Date();
  }

  private handleTyping(ws: WebSocket, typing: boolean): void {
    const state = this.clientState.get(ws);
    if (!state) return;

    const { room, member } = state;
    member.typing = typing;

    room.broadcast(
      { type: "typing_update", nickname: member.nickname, typing },
      ws
    );
  }

  private handleHeartbeat(ws: WebSocket): void {
    const state = this.clientState.get(ws);
    if (state) {
      state.room.lastActivity = new Date();
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    if (this.clientState.has(ws)) {
      this.handleLeaveRoom(ws);
    }
  }

  private broadcastPresence(room: Room): void {
    const members = Array.from(room.members.values());
    room.broadcast({ type: "presence", members });
  }

  private startGraceTimer(room: Room): void {
    room.graceTimer = setTimeout(() => {
      this.rooms.delete(room.code);
      console.log(`[chat-relay] room ${room.code} expired after grace period`);
    }, GRACE_PERIOD_MS);
  }

  close(): void {
    // Clear all grace timers
    for (const room of this.rooms.values()) {
      if (room.graceTimer !== null) {
        clearTimeout(room.graceTimer);
      }
    }
    this.wss.close();
  }
}
