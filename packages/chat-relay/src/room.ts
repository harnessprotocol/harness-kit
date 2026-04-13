import { WebSocket } from "ws";
import type { AnyMessage, Member, ServerMessage } from "./protocol.js";
import { RingBuffer } from "./ring-buffer.js";

const MESSAGE_HISTORY_CAPACITY = 500;

export class Room {
  readonly code: string;
  readonly name: string | null;
  readonly members: Map<WebSocket, Member>;
  readonly messages: RingBuffer<AnyMessage>;
  lastActivity: Date;
  graceTimer: ReturnType<typeof setTimeout> | null;

  constructor(
    code: string,
    name?: string,
    readonly gracePeriodMs: number = 300_000,
  ) {
    this.code = code;
    this.name = name ?? null;
    this.members = new Map();
    this.messages = new RingBuffer<AnyMessage>(MESSAGE_HISTORY_CAPACITY);
    this.lastActivity = new Date();
    this.graceTimer = null;
  }

  addMember(ws: WebSocket, member: Member): void {
    this.members.set(ws, member);
    this.lastActivity = new Date();
  }

  removeMember(ws: WebSocket): Member | undefined {
    const member = this.members.get(ws);
    this.members.delete(ws);
    return member;
  }

  getMemberByNickname(nickname: string): [WebSocket, Member] | undefined {
    for (const [ws, member] of this.members) {
      if (member.nickname === nickname) {
        return [ws, member];
      }
    }
    return undefined;
  }

  broadcast(msg: ServerMessage, exclude?: WebSocket): void {
    const payload = JSON.stringify(msg);
    for (const [client] of this.members) {
      if (client === exclude) continue;
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch (err) {
          console.warn("[chat-relay] send failed for client:", err);
        }
      }
    }
  }

  send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch (err) {
        console.warn("[chat-relay] send failed for client:", err);
      }
    }
  }

  isEmpty(): boolean {
    return this.members.size === 0;
  }
}
