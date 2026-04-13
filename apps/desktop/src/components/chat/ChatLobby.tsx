import { useEffect, useState } from "react";
import { useChat } from "../../contexts/ChatContext";

function getStoredNick(): string {
  try {
    return localStorage.getItem("harness-kit-chat-nick") ?? "";
  } catch {
    return "";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function ChatLobby() {
  const { createRoom, joinRoom, recentRooms } = useChat();

  // Create room section
  const [createNick, setCreateNick] = useState(getStoredNick);
  const [createName, setCreateName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Join room section
  const [joinCode, setJoinCode] = useState("");
  const [joinNick, setJoinNick] = useState(getStoredNick);

  useEffect(() => {
    const stored = getStoredNick();
    if (stored) {
      setCreateNick(stored);
      setJoinNick(stored);
    }
  }, []);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const nickTrimmed = createNick.trim();
    if (!nickTrimmed) return;
    const keepAlive = Number(localStorage.getItem("harness-kit-chat-keep-alive") ?? "5") || 5;
    createRoom(nickTrimmed, createName.trim() || undefined, keepAlive);
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim() || !joinNick.trim()) return;
    joinRoom(joinCode.trim().toUpperCase(), joinNick.trim());
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
      {/* Create Room */}
      <div style={{ marginBottom: "16px" }}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase" as const,
            color: "var(--fg-subtle)",
            marginBottom: "6px",
          }}
        >
          Create Room
        </div>
        {!showCreate ? (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowCreate(true)}
            style={{ width: "100%" }}
          >
            + New room
          </button>
        ) : (
          <form
            onSubmit={handleCreate}
            style={{ display: "flex", flexDirection: "column", gap: "6px" }}
          >
            <input
              type="text"
              className="form-input"
              placeholder="Your nickname"
              value={createNick}
              onChange={(e) => setCreateNick(e.target.value)}
              autoFocus
              required
            />
            <input
              type="text"
              className="form-input"
              placeholder="Room name (optional)"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                Create
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Join Room */}
      <div style={{ marginBottom: "16px" }}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase" as const,
            color: "var(--fg-subtle)",
            marginBottom: "6px",
          }}
        >
          Join Room
        </div>
        <form
          onSubmit={handleJoin}
          style={{ display: "flex", flexDirection: "column", gap: "6px" }}
        >
          <input
            type="text"
            className="form-input"
            placeholder="Room code (e.g. ABCD)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            style={{ textTransform: "uppercase" as const }}
            required
          />
          <input
            type="text"
            className="form-input"
            placeholder="Your nickname"
            value={joinNick}
            onChange={(e) => setJoinNick(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-accent btn-sm">
            Join
          </button>
        </form>
      </div>

      {/* Recent Rooms */}
      {recentRooms.length > 0 && (
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase" as const,
              color: "var(--fg-subtle)",
              marginBottom: "6px",
            }}
          >
            Recent Rooms
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {recentRooms.map((room) => (
              <button
                key={room.code}
                className="row-list-item"
                onClick={() => joinRoom(room.code, room.nickname)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  borderRadius: "5px",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--accent-text)",
                    flexShrink: 0,
                  }}
                >
                  {room.code}
                </span>
                {room.name && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--fg-muted)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {room.name}
                  </span>
                )}
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--fg-subtle)",
                    flexShrink: 0,
                    marginLeft: "auto",
                  }}
                >
                  {formatDate(room.leftAt ?? room.joinedAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
