import { useState } from "react";
import { useChat } from "../../contexts/ChatContext";
import ChatInput from "./ChatInput";
import MessageList from "./MessageList";
import SharesTab from "./SharesTab";
import { TypingIndicator } from "./TypingIndicator";

export default function ChatRoom() {
  const { state, leaveRoom, shutdownServer, typingMembers } = useChat();
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
          {state.roomName ? (
            <>
              {state.roomName}{" "}
              <span style={{ color: "var(--fg-subtle)", fontWeight: 400 }}>· {state.roomCode}</span>
            </>
          ) : (
            state.roomCode
          )}
        </span>
        {/* Copy code button */}
        <button
          onClick={() => navigator.clipboard.writeText(state.roomCode)}
          title="Copy room code"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--fg-subtle)",
            padding: "2px 4px",
            borderRadius: "4px",
            fontSize: "10px",
          }}
        >
          Copy
        </button>
        <button className="btn btn-sm btn-secondary" onClick={leaveRoom}>
          Leave
        </button>
        {state.isHost && (
          <button
            className="btn btn-sm"
            style={{ background: "var(--danger)", color: "#fff", border: "none" }}
            onClick={shutdownServer}
            title="Shut down the relay server"
          >
            Shut down
          </button>
        )}
      </div>

      {/* Participant list — always visible */}
      <div
        style={{
          flexShrink: 0,
          padding: "6px 12px 8px",
          borderBottom: "1px solid var(--separator)",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--fg-subtle)",
            marginBottom: "4px",
          }}
        >
          {state.members.length} online
        </div>
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
              padding: "1px 0",
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
            {m.nickname}
            {m.nickname === state.nickname ? " (you)" : ""}
          </div>
        ))}
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
          <MessageList messages={state.messages} currentNickname={state.nickname} />
          <TypingIndicator typingMembers={typingMembers} />
          <ChatInput />
        </>
      ) : (
        <SharesTab messages={state.messages} />
      )}
    </div>
  );
}
