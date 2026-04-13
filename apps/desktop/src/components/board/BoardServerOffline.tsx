import type { BoardServerReadyState } from "../../hooks/useBoardServerReady";

interface Props {
  serverState: BoardServerReadyState;
}

export function BoardServerOffline({ serverState }: Props) {
  const { installed, starting, error, install, start } = serverState;

  const buttonStyle = {
    padding: "8px 20px",
    fontSize: 13,
    fontWeight: 600 as const,
    borderRadius: 6,
    border: "none",
    cursor: starting ? "not-allowed" : "pointer",
    background: "var(--accent)",
    color: "#fff",
    opacity: starting ? 0.6 : 1,
    transition: "opacity 0.15s",
  };

  return (
    <div
      className="board-scope"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <span style={{ color: "var(--text-secondary)", fontSize: 14, fontWeight: 600 }}>
        Board server is not running
      </span>

      {installed === false ? (
        <>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            The background service needs to be installed first.
          </span>
          <button style={buttonStyle} disabled={starting} onClick={install}>
            {starting ? "Installing..." : "Install & Start"}
          </button>
        </>
      ) : (
        <>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            The background service is installed but not responding.
          </span>
          <button style={buttonStyle} disabled={starting} onClick={start}>
            {starting ? "Starting..." : "Start Server"}
          </button>
        </>
      )}

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 14px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--text-secondary)",
            maxWidth: 420,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
