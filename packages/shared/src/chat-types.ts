export type ChatMessageType = "chat" | "share" | "system";

export type ShareAction =
  | "harness_updated"
  | "plugin_installed"
  | "plugin_uninstalled"
  | "sync_applied"
  | "permissions_changed"
  | "preset_applied";

export interface ChatMessage {
  id: string;
  roomCode: string;
  type: "chat";
  nickname: string;
  timestamp: string; // ISO 8601
  body: string;
}

export interface ShareMessage {
  id: string;
  roomCode: string;
  type: "share";
  nickname: string;
  timestamp: string;
  action: ShareAction;
  target: string;
  detail: string | null;
  diff: string | null;
  pullable: boolean;
}

export interface SystemMessage {
  id: string;
  roomCode: string;
  type: "system";
  nickname: string;
  timestamp: string;
  event: "join" | "leave" | "nick_change" | "room_created";
  detail: string | null;
}

export type AnyMessage = ChatMessage | ShareMessage | SystemMessage;

// Relay protocol types (used by both relay server and desktop client)
export interface Member {
  nickname: string;
  joinedAt: string;
  typing: boolean;
}

export type ClientMessage =
  | { type: "create_room"; name?: string; nickname: string }
  | { type: "join_room"; code: string; nickname: string }
  | { type: "leave_room" }
  | { type: "chat"; body: string }
  | { type: "share"; action: ShareAction; target: string; detail?: string; diff?: string; pullable?: boolean }
  | { type: "typing"; typing: boolean }
  | { type: "heartbeat" };

export type ServerMessage =
  | { type: "room_created"; code: string; name?: string }
  | { type: "room_joined"; code: string; name?: string; members: Member[]; history: AnyMessage[] }
  | { type: "room_error"; error: string }
  | { type: "message"; message: AnyMessage }
  | { type: "presence"; members: Member[] }
  | { type: "typing_update"; nickname: string; typing: boolean };
