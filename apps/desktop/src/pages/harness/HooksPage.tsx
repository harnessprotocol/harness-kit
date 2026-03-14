import { useEffect, useState } from "react";
import { readHooks } from "../../lib/tauri";
import type { HooksConfig, HookCommand } from "@harness-kit/shared";

export default function HooksPage() {
  const [hooks, setHooks] = useState<HooksConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readHooks()
      .then(setHooks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const hookEntries = hooks ? Object.entries(hooks) : [];

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
          Hooks
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Claude Code hooks configured in your settings.
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

      {!loading && !error && hookEntries.length === 0 && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "32px 16px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>No hooks configured.</p>
        </div>
      )}

      {!loading && !error && hookEntries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {hookEntries.map(([event, commands]) => (
            <div key={event}>
              <div style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--fg-subtle)",
                marginBottom: "4px",
                padding: "0 2px",
              }}>
                {event}
              </div>
              <div className="row-list">
                {(commands as HookCommand[]).map((cmd, i) => (
                  <div key={i} className="row-list-item">
                    <code style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "12px",
                      color: "var(--fg-base)",
                    }}>
                      {cmd.command}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
