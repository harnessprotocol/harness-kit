import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { Room } from "./room.js";
const GRACE_PERIOD_MS = 300_000; // 5 minutes
// Uppercase consonants only — avoids forming recognisable words
const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function randomChar(alphabet) {
    return alphabet[Math.floor(Math.random() * alphabet.length)];
}
function generateRoomCode() {
    const prefix = Array.from({ length: 3 }, () => randomChar(CONSONANTS)).join("");
    const suffix = Array.from({ length: 3 }, () => randomChar(ALPHANUMERIC)).join("");
    return `${prefix}-${suffix}`;
}
export class ChatRelay {
    wss;
    rooms;
    clientState;
    constructor(wss) {
        this.wss = wss;
        this.rooms = new Map();
        this.clientState = new Map();
        wss.on("connection", (ws) => {
            this.handleConnection(ws);
        });
    }
    handleConnection(ws) {
        ws.on("message", (data) => {
            let msg;
            try {
                msg = JSON.parse(data.toString());
            }
            catch {
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
    handleMessage(ws, msg) {
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
                const _exhaustive = msg;
                console.warn("[chat-relay] unknown message type:", _exhaustive);
            }
        }
    }
    handleCreateRoom(ws, nickname, name) {
        if (!nickname || nickname.length > 32) {
            const errMsg = { type: "room_error", error: "nickname must be 1–32 characters" };
            if (ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify(errMsg));
            return;
        }
        if (name !== undefined && name.length > 64) {
            const errMsg = { type: "room_error", error: "room name must be ≤ 64 characters" };
            if (ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify(errMsg));
            return;
        }
        // Generate a unique code, retrying on collision
        let code;
        let attempts = 0;
        do {
            code = generateRoomCode();
            attempts++;
            if (attempts > 10)
                throw new Error("Failed to generate unique room code after 10 attempts");
        } while (this.rooms.has(code));
        const room = new Room(code, name);
        this.rooms.set(code, room);
        const createdMsg = { type: "room_created", code, ...(name ? { name } : {}) };
        room.send(ws, createdMsg);
        // Immediately join the creator
        this.handleJoinRoom(ws, code, nickname);
    }
    handleJoinRoom(ws, code, nickname) {
        if (!nickname || nickname.length > 32) {
            const errMsg = { type: "room_error", error: "nickname must be 1–32 characters" };
            if (ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify(errMsg));
            return;
        }
        const room = this.rooms.get(code);
        if (!room) {
            const errMsg = { type: "room_error", error: `Room ${code} does not exist` };
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(errMsg));
            }
            return;
        }
        if (room.getMemberByNickname(nickname)) {
            const errMsg = {
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
        const member = {
            nickname,
            joinedAt: new Date().toISOString(),
            typing: false,
        };
        room.addMember(ws, member);
        this.clientState.set(ws, { room, member });
        // Send room_joined to the new member (with history + current member list)
        const joinedMsg = {
            type: "room_joined",
            code,
            ...(room.name ? { name: room.name } : {}),
            members: Array.from(room.members.values()),
            history: room.messages.toArray(),
        };
        room.send(ws, joinedMsg);
        // Record and broadcast the join system message to existing members
        const sysMsg = {
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
    handleLeaveRoom(ws) {
        const state = this.clientState.get(ws);
        if (!state)
            return;
        const { room, member } = state;
        this.clientState.delete(ws);
        room.removeMember(ws);
        // Broadcast leave system message
        const sysMsg = {
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
    handleChat(ws, body) {
        const state = this.clientState.get(ws);
        if (!state) {
            console.warn("[chat-relay] chat message from client not in a room — ignoring");
            return;
        }
        const { room, member } = state;
        const chatMsg = {
            id: randomUUID(),
            roomCode: room.code,
            type: "chat",
            nickname: member.nickname,
            timestamp: new Date().toISOString(),
            body,
        };
        room.messages.push(chatMsg);
        room.broadcast({ type: "message", message: chatMsg });
        room.lastActivity = new Date();
    }
    handleShare(ws, msg) {
        const state = this.clientState.get(ws);
        if (!state) {
            console.warn("[chat-relay] share message from client not in a room — ignoring");
            return;
        }
        const { room, member } = state;
        const shareMsg = {
            id: randomUUID(),
            roomCode: room.code,
            type: "share",
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
    handleTyping(ws, typing) {
        const state = this.clientState.get(ws);
        if (!state)
            return;
        const { room, member } = state;
        member.typing = typing;
        room.broadcast({ type: "typing_update", nickname: member.nickname, typing }, ws);
    }
    handleHeartbeat(ws) {
        const state = this.clientState.get(ws);
        if (state) {
            state.room.lastActivity = new Date();
        }
    }
    handleDisconnect(ws) {
        if (this.clientState.has(ws)) {
            this.handleLeaveRoom(ws);
        }
    }
    broadcastPresence(room) {
        const members = Array.from(room.members.values());
        room.broadcast({ type: "presence", members });
    }
    startGraceTimer(room) {
        room.graceTimer = setTimeout(() => {
            this.rooms.delete(room.code);
            room.graceTimer = null;
            console.log(`[chat-relay] room ${room.code} expired after grace period`);
        }, GRACE_PERIOD_MS);
    }
    close() {
        // Clear all grace timers
        for (const room of this.rooms.values()) {
            if (room.graceTimer !== null) {
                clearTimeout(room.graceTimer);
            }
        }
        this.wss.close();
    }
}
//# sourceMappingURL=relay.js.map