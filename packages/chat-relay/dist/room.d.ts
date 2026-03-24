import { WebSocket } from "ws";
import type { Member, ServerMessage, AnyMessage } from "./protocol.js";
import { RingBuffer } from "./ring-buffer.js";
export declare class Room {
    readonly code: string;
    readonly name: string | null;
    readonly members: Map<WebSocket, Member>;
    readonly messages: RingBuffer<AnyMessage>;
    lastActivity: Date;
    graceTimer: ReturnType<typeof setTimeout> | null;
    constructor(code: string, name?: string);
    addMember(ws: WebSocket, member: Member): void;
    removeMember(ws: WebSocket): Member | undefined;
    getMemberByNickname(nickname: string): [WebSocket, Member] | undefined;
    broadcast(msg: ServerMessage, exclude?: WebSocket): void;
    send(ws: WebSocket, msg: ServerMessage): void;
    isEmpty(): boolean;
}
//# sourceMappingURL=room.d.ts.map