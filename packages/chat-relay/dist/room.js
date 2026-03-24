import { WebSocket } from "ws";
import { RingBuffer } from "./ring-buffer.js";
const MESSAGE_HISTORY_CAPACITY = 500;
export class Room {
    code;
    name;
    members;
    messages;
    lastActivity;
    graceTimer;
    constructor(code, name) {
        this.code = code;
        this.name = name ?? null;
        this.members = new Map();
        this.messages = new RingBuffer(MESSAGE_HISTORY_CAPACITY);
        this.lastActivity = new Date();
        this.graceTimer = null;
    }
    addMember(ws, member) {
        this.members.set(ws, member);
        this.lastActivity = new Date();
    }
    removeMember(ws) {
        const member = this.members.get(ws);
        this.members.delete(ws);
        return member;
    }
    getMemberByNickname(nickname) {
        for (const [ws, member] of this.members) {
            if (member.nickname === nickname) {
                return [ws, member];
            }
        }
        return undefined;
    }
    broadcast(msg, exclude) {
        const payload = JSON.stringify(msg);
        for (const [client] of this.members) {
            if (client === exclude)
                continue;
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(payload);
                }
                catch (err) {
                    console.warn("[chat-relay] send failed for client:", err);
                }
            }
        }
    }
    send(ws, msg) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(msg));
            }
            catch (err) {
                console.warn("[chat-relay] send failed for client:", err);
            }
        }
    }
    isEmpty() {
        return this.members.size === 0;
    }
}
//# sourceMappingURL=room.js.map