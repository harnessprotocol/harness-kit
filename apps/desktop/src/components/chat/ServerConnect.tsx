import { useState } from "react";
import { useChat } from "../../contexts/ChatContext";
import { chatStartLocalRelay } from "../../lib/tauri";

const DEFAULT_URL = "ws://localhost:4801";

function getStoredServer(): string {
  try {
    return localStorage.getItem("harness-kit-chat-server") ?? "";
  } catch {
    return "";
  }
}

function getStoredKeepAlive(): number {
  try {
    return Number(localStorage.getItem("harness-kit-chat-keep-alive") ?? "5") || 5;
  } catch {
    return 5;
  }
}

export default function ServerConnect() {
  const { connect } = useChat();
  const stored = getStoredServer();
  const [tab, setTab] = useState<"host" | "join">(stored ? "join" : "host");
  const [url, setUrl] = useState(stored || DEFAULT_URL);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepAliveMinutes, setKeepAliveMinutes] = useState(getStoredKeepAlive);

  async function handleHost() {
    setStarting(true);
    setError(null);
    try {
      localStorage.setItem("harness-kit-chat-keep-alive", String(keepAliveMinutes));
      const port = await chatStartLocalRelay();
      connect(`ws://localhost:${port}`);
    } catch (e) {
      setError(String(e));
      setStarting(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    connect(url.trim());
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "6px",
    fontSize: "12px",
    fontWeight: 600,
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--accent-fg)" : "var(--fg-subtle)",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  });

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "20px 16px",
        gap: "16px",
      }}
    >
      {/* Tab switcher */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          padding: "4px",
          background: "var(--bg-subtle)",
          borderRadius: "7px",
        }}
      >
        <button style={tabStyle(tab === "host")} onClick={() => setTab("host")}>
          Host
        </button>
        <button style={tabStyle(tab === "join")} onClick={() => setTab("join")}>
          Join
        </button>
      </div>

      {tab === "host" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "12px", color: "var(--fg-muted)", lineHeight: 1.5 }}>
            Start a relay server on this machine. Share the URL and room code with teammates so they
            can join.
          </div>
          <div
            style={{
              background: "var(--bg-subtle)",
              borderRadius: "6px",
              padding: "10px 12px",
              fontFamily: "ui-monospace, monospace",
              fontSize: "11px",
              color: "var(--fg-subtle)",
            }}
          >
            ws://YOUR_IP:4801
          </div>
          <div style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
            Replace <code>YOUR_IP</code> with your machine's local IP address when sharing with
            teammates.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", color: "var(--fg-subtle)", fontWeight: 500 }}>
              Keep room alive after everyone leaves
            </label>
            <select
              className="form-input"
              value={keepAliveMinutes}
              onChange={(e) => setKeepAliveMinutes(Number(e.target.value))}
            >
              <option value={5}>5 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={240}>4 hours</option>
              <option value={720}>12 hours</option>
              <option value={1440}>24 hours</option>
            </select>
          </div>
          {error && <div style={{ fontSize: "11px", color: "var(--red)" }}>{error}</div>}
          <button className="btn btn-primary btn-sm" onClick={handleHost} disabled={starting}>
            {starting ? "Starting…" : "Start server & create room"}
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleJoin}
          style={{ display: "flex", flexDirection: "column", gap: "8px" }}
        >
          <label style={{ fontSize: "11px", color: "var(--fg-subtle)", fontWeight: 500 }}>
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
      )}
    </div>
  );
}
