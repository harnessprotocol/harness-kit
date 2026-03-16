import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listInstalledPlugins } from "../../lib/tauri";
import type { InstalledPlugin } from "@harness-kit/shared";

export default function PluginsPage() {
  const navigate = useNavigate();
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInstalledPlugins()
      .then(setPlugins)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
          Installed Plugins
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Plugins in your <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>~/.claude/</code> environment.
        </p>
      </div>

      {loading && (
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
      )}

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

      {!loading && !error && plugins.length === 0 && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "40px 16px",
          textAlign: "center",
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: "var(--fg-subtle)", marginBottom: "10px" }}>
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M17.5 14v7M14 17.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "0 0 4px" }}>No plugins installed.</p>
          <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "0 0 12px" }}>
            Install via <code style={{ fontFamily: "ui-monospace, monospace" }}>/plugin install</code> in Claude Code.
          </p>
          <button
            onClick={() => navigate("/marketplace")}
            style={{
              fontSize: "11px",
              color: "var(--accent-text)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
              padding: 0,
            }}
          >
            Browse Marketplace →
          </button>
        </div>
      )}

      {!loading && !error && plugins.length > 0 && (
        <div className="row-list">
          {plugins.map((plugin) => (
            <div key={plugin.name} className="row-list-item" style={{ justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg-base)" }}>
                    {plugin.name}
                  </span>
                  {plugin.marketplace && (
                    <span style={{
                      fontSize: "10px",
                      fontWeight: 500,
                      padding: "1px 6px",
                      borderRadius: "4px",
                      background: "var(--accent-light)",
                      color: "var(--accent-text)",
                      letterSpacing: "0.01em",
                    }}>
                      {plugin.marketplace}
                    </span>
                  )}
                </div>
                {plugin.description && (
                  <p style={{
                    fontSize: "11px",
                    color: "var(--fg-muted)",
                    margin: "1px 0 0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "320px",
                  }}>
                    {plugin.description}
                  </p>
                )}
              </div>
              <span style={{
                fontSize: "11px",
                fontFamily: "ui-monospace, monospace",
                color: "var(--fg-subtle)",
                flexShrink: 0,
                marginLeft: "12px",
              }}>
                {plugin.version}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
