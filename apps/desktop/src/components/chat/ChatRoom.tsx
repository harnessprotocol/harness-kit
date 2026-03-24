import { useState } from "react";
import { useChat } from "../../context/ChatContext";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";

export default function ChatRoom() {
  const { state, leaveRoom } = useChat();
  const [activeTab, setActiveTab] = useState<"chat" | "shares">("chat");

  if (state.status !== "in_room") return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: "8px 12px",
          borderBottom: "1px solid var(--separator)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--fg-base)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          #{state.roomCode}
          {state.roomName && (
            <span
              style={{
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
                fontWeight: 400,
                color: "var(--fg-muted)",
                marginLeft: "6px",
              }}
            >
              {state.roomName}
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "var(--fg-subtle)",
            flexShrink: 0,
          }}
        >
          {state.members.length} online
        </span>
        <button
          className="btn btn-sm btn-secondary"
          onClick={leaveRoom}
        >
          Leave
        </button>
      </div>

      {/* Tab bar */}
      <div className="tab-bar" style={{ flexShrink: 0 }}>
        <button
          className={`tab${activeTab === "chat" ? " active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          className={`tab${activeTab === "shares" ? " active" : ""}`}
          onClick={() => setActiveTab("shares")}
        >
          Shares
        </button>
      </div>

      {/* Content */}
      {activeTab === "chat" ? (
        <>
          <MessageList
            messages={state.messages}
            currentNickname={state.nickname}
          />
          <ChatInput />
        </>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            color: "var(--fg-subtle)",
          }}
        >
          Shares coming soon
        </div>
      )}
    </div>
  );
}
