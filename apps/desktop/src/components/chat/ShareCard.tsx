import { useState } from "react";
import type { ShareMessage, ShareAction } from "@harness-kit/shared";

const ACTION_ICONS: Record<ShareAction, string> = {
  harness_updated: "✦",
  plugin_installed: "↓",
  plugin_uninstalled: "↑",
  sync_applied: "⟳",
  permissions_changed: "🔒",
  preset_applied: "◆",
};

const ACTION_LABELS: Record<ShareAction, string> = {
  harness_updated: "updated harness.yaml",
  plugin_installed: "installed plugin",
  plugin_uninstalled: "removed plugin",
  sync_applied: "synced config",
  permissions_changed: "changed permissions",
  preset_applied: "applied preset",
};

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

interface Props {
  message: ShareMessage;
}

export default function ShareCard({ message }: Props) {
  const [diffOpen, setDiffOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopyCode() {
    navigator.clipboard.writeText(message.roomCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      style={{
        margin: "4px 12px",
        borderRadius: "6px",
        border: "1px solid var(--border-base)",
        borderLeft: "3px solid var(--accent)",
        background: "var(--bg-elevated)",
        fontSize: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 10px 4px",
        }}
      >
        <span
          style={{
            color: "var(--accent)",
            fontSize: "13px",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {ACTION_ICONS[message.action]}
        </span>
        <span style={{ color: "var(--fg-base)", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--fg-muted)" }}>{message.nickname}</span>
          {" shared "}
          <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--fg-base)" }}>{message.target}</span>
        </span>
        <span style={{ color: "var(--fg-subtle)", fontSize: "10px", flexShrink: 0 }}>
          [{formatTime(message.timestamp)}]
        </span>
      </div>

      {/* Action label row */}
      <div style={{ padding: "0 10px 6px", paddingLeft: "29px", color: "var(--fg-muted)", fontSize: "11px" }}>
        {ACTION_LABELS[message.action]}
        {message.detail && (
          <span style={{ color: "var(--fg-subtle)", marginLeft: "6px" }}>
            — {message.detail}
          </span>
        )}
      </div>

      {/* Diff toggle */}
      {message.diff !== null && (
        <>
          <div style={{ borderTop: "1px solid var(--border-base)", padding: "4px 10px" }}>
            <button
              onClick={() => setDiffOpen((o) => !o)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--fg-subtle)",
                fontSize: "10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "8px" }}>{diffOpen ? "▾" : "▸"}</span>
              {diffOpen ? "Hide diff" : "Show diff"}
            </button>
          </div>
          {diffOpen && (
            <pre
              style={{
                margin: 0,
                padding: "8px 10px",
                background: "var(--bg-surface)",
                borderTop: "1px solid var(--border-base)",
                fontFamily: "ui-monospace, monospace",
                fontSize: "10px",
                color: "var(--fg-base)",
                overflowX: "auto",
                whiteSpace: "pre",
                maxHeight: "200px",
                overflowY: "auto",
              }}
            >
              {message.diff}
            </pre>
          )}
        </>
      )}

      {/* Pullable: Copy room code button */}
      {message.pullable && (
        <div
          style={{
            borderTop: "1px solid var(--border-base)",
            padding: "5px 10px",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={handleCopyCode}
            style={{
              padding: "3px 10px",
              borderRadius: "4px",
              border: "1px solid var(--border-base)",
              background: "var(--bg-surface)",
              color: copied ? "var(--accent)" : "var(--fg-base)",
              fontSize: "10px",
              cursor: "pointer",
              fontWeight: 500,
              transition: "color 0.15s",
            }}
          >
            {copied ? "Copied!" : "Copy Code"}
          </button>
        </div>
      )}
    </div>
  );
}
