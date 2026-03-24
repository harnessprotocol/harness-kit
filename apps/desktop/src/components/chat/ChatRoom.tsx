import { useState } from "react";
import { useChat } from "../../context/ChatContext";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import SharesTab from "./SharesTab";
import { TypingIndicator } from "./TypingIndicator";

export default function ChatRoom() {
  const { state, leaveRoom, typingMembers } = useChat();
  const [activeTab, setActiveTab] = useState<"chat" | "shares">("chat");
  const [showMembers, setShowMembers] = useState(false);

  if (state.status !== "in_room") return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: "8px 12px",
          borderBottom: showMembers ? "none" : "1px solid var(--separator)",
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
        <button
          onClick={() => setShowMembers(!showMembers)}
          style={{
            fontSize: "11px",
            color: showMembers ? "var(--accent-text)" : "var(--fg-subtle)",
            background: showMembers ? "var(--accent-light)" : "transparent",
            border: "none",
            borderRadius: "4px",
            padding: "2px 6px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {state.members.length} online
        </button>
        <button
          className="btn btn-sm btn-secondary"
          onClick={leaveRoom}
        >
          Leave
        </button>
      </div>

      {/* Collapsible member list */}
      {showMembers && (
        <div
          style={{
            flexShrink: 0,
            padding: "6px 12px 8px",
            borderBottom: "1px solid var(--separator)",
            display: "flex",
            flexDirection: "column",
            gap: "3px",
          }}
        >
          {state.members.map((m) => (
            <div
              key={m.nickname}
              style={{
                fontSize: "11px",
                color: m.nickname === state.nickname ? "var(--fg-base)" : "var(--fg-muted)",
                fontWeight: m.nickname === state.nickname ? 600 : 400,
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--success)",
                  flexShrink: 0,
                }}
              />
              {m.nickname}{m.nickname === state.nickname ? " (you)" : ""}
            </div>
          ))}
        </div>
      )}

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
          <TypingIndicator typingMembers={typingMembers} />
          <ChatInput />
        </>
      ) : (
        <SharesTab messages={state.messages} />
      )}
    </div>
  );
}
