import { useEffect } from "react";
import { useChat } from "../../contexts/ChatContext";
import ServerConnect from "./ServerConnect";
import ChatLobby from "./ChatLobby";
import ChatRoom from "./ChatRoom";

export default function ChatPanel() {
  const { setOpen, state } = useChat();

  // Escape key to close
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);

  return (
    <div
      style={{
        width: "340px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-sidebar)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderLeft: "1px solid var(--border-base)",
      }}
    >
      {/* Panel header */}
      <div
        style={{
          flexShrink: 0,
          height: "38px",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          borderBottom: "1px solid var(--separator)",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--fg-base)",
            flex: 1,
          }}
        >
          Chat
        </span>
        {state.status !== "disconnected" && state.status !== "connecting" && (
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background:
                state.status === "in_room"
                  ? "var(--success)"
                  : "var(--fg-subtle)",
            }}
          />
        )}
      </div>

      {/* Content */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {state.status === "disconnected" && <ServerConnect />}
        {state.status === "connecting" && (
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
            Connecting…
          </div>
        )}
        {state.status === "connected" && <ChatLobby />}
        {state.status === "in_room" && <ChatRoom />}
      </div>
    </div>
  );
}
