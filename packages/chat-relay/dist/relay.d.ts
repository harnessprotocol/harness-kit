import { WebSocket, WebSocketServer } from "ws";
export declare class ChatRelay {
    private readonly wss;
    private rooms;
    private clientState;
    constructor(wss: WebSocketServer);
    handleConnection(ws: WebSocket): void;
    private handleMessage;
    private handleCreateRoom;
    private handleJoinRoom;
    private handleLeaveRoom;
    private handleChat;
    private handleShare;
    private handleTyping;
    private handleHeartbeat;
    private handleDisconnect;
    private broadcastPresence;
    private startGraceTimer;
    close(): void;
}
//# sourceMappingURL=relay.d.ts.map