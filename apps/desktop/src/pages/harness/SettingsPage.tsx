import { useEffect, useState } from "react";
import { listClaudeDir } from "../../lib/tauri";

export default function SettingsPage() {
  const [entries, setEntries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClaudeDir()
      .then(setEntries)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
          Settings
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Contents of{" "}
          <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>~/.claude/</code>.
        </p>
      </div>

      {loading && <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>}

      {error && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "13px",
          color: "var(--danger)",
        }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="row-list">
          {entries.map((entry) => (
            <div key={entry} className="row-list-item">
              <span style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "12px",
                color: "var(--fg-muted)",
              }}>
                {entry}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
