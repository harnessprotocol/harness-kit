import { useState } from "react";
import { useChat } from "../../context/ChatContext";

const DEFAULT_URL = "ws://localhost:4801";

function getStoredServer(): string {
  try { return localStorage.getItem("harness-kit-chat-server") ?? DEFAULT_URL; } catch { return DEFAULT_URL; }
}

export default function ServerConnect() {
  const { connect } = useChat();
  const [url, setUrl] = useState(getStoredServer);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    connect(url.trim());
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        gap: "12px",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--fg-base)",
          marginBottom: "4px",
        }}
      >
        Connect to relay server
      </div>
      <form
        onSubmit={handleSubmit}
        style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}
      >
        <label
          style={{
            fontSize: "11px",
            color: "var(--fg-subtle)",
            fontWeight: 500,
          }}
        >
          Relay server URL
        </label>
        <input
          type="text"
          className="form-input"
          placeholder={DEFAULT_URL}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          required
        />
        <button type="submit" className="btn btn-primary btn-sm">
          Connect
        </button>
      </form>
    </div>
  );
}
