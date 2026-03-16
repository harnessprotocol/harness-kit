import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listInstalledPlugins, checkPluginUpdates } from "../../lib/tauri";
import type { InstalledPlugin, PluginUpdateInfo } from "@harness-kit/shared";
import ContextMenu from "../../components/ContextMenu";

function relativeDate(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function SourceBadge({ marketplace }: { marketplace?: string }) {
  if (!marketplace) {
    return (
      <span style={{
        fontSize: "10px", fontWeight: 500, padding: "1px 7px", borderRadius: "10px",
        background: "var(--bg-elevated)", color: "var(--fg-muted)",
        border: "1px solid var(--border-base)", whiteSpace: "nowrap",
      }}>
        local
      </span>
    );
  }
  if (marketplace === "harness-kit") {
    return (
      <span style={{
        fontSize: "10px", fontWeight: 500, padding: "1px 7px", borderRadius: "10px",
        background: "rgba(59,130,246,0.12)", color: "var(--accent-text)",
        border: "1px solid rgba(59,130,246,0.25)", whiteSpace: "nowrap",
      }}>
        official
      </span>
    );
  }
  return (
    <span style={{
      fontSize: "10px", fontWeight: 500, padding: "1px 7px", borderRadius: "10px",
      background: "var(--accent-light)", color: "var(--accent-text)",
      border: "1px solid var(--accent-border, var(--border-base))", whiteSpace: "nowrap",
    }}>
      {marketplace}
    </span>
  );
}

const COL_NAME = { flex: "1 1 0", minWidth: 120 };
const COL_SOURCE = { width: 90, flexShrink: 0 };
const COL_CATEGORY = { width: 100, flexShrink: 0 };
const COL_VERSION = { width: 120, flexShrink: 0, textAlign: "right" as const };
const COL_UPDATED = { width: 88, flexShrink: 0, textAlign: "right" as const };

export default function PluginsPage() {
  const navigate = useNavigate();
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [updates, setUpdates] = useState<Record<string, PluginUpdateInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; plugin: InstalledPlugin } | null>(null);

  useEffect(() => {
    listInstalledPlugins()
      .then(setPlugins)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));

    checkPluginUpdates()
      .then((infos) => {
        const map: Record<string, PluginUpdateInfo> = {};
        for (const info of infos) map[info.name] = info;
        setUpdates(map);
      })
      .catch(() => {}); // updates are best-effort
  }, []);

  const hasUpdates = Object.keys(updates).length > 0;

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
            Installed Plugins
          </h1>
          <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
            Plugins in your <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>~/.claude/</code> environment.
          </p>
        </div>
        {hasUpdates && (
          <button
            disabled
            title="Run /plugin update in Claude Code to apply updates"
            style={{
              fontSize: "12px", fontWeight: 500, padding: "5px 12px",
              borderRadius: "6px", border: "1px solid var(--border-base)",
              background: "var(--bg-elevated)", color: "var(--fg-muted)",
              cursor: "not-allowed", opacity: 0.7,
            }}
          >
            Update All ({Object.keys(updates).length})
          </button>
        )}
      </div>

      {loading && (
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
      )}

      {error && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-base)",
          borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "var(--danger)",
        }}>
          {error}
        </div>
      )}

      {!loading && !error && plugins.length === 0 && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-base)",
          borderRadius: "8px", padding: "40px 16px", textAlign: "center",
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
              fontSize: "11px", color: "var(--accent-text)", background: "none",
              border: "none", cursor: "pointer", fontWeight: 500, padding: 0,
            }}
          >
            Browse Marketplace →
          </button>
        </div>
      )}

      {!loading && !error && plugins.length > 0 && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-base)",
          borderRadius: "8px", overflow: "hidden",
        }}>
          {/* Column header */}
          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "7px 14px",
            borderBottom: "1px solid var(--border-base)",
            fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <span style={COL_NAME}>Plugin</span>
            <span style={COL_SOURCE}>Source</span>
            <span style={COL_CATEGORY}>Category</span>
            <span style={COL_VERSION}>Version</span>
            <span style={COL_UPDATED}>Updated</span>
          </div>

          {/* Rows */}
          {plugins.map((plugin, i) => {
            const update = updates[plugin.name];
            const isLast = i === plugins.length - 1;
            return (
              <div
                key={plugin.name}
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  padding: "10px 14px",
                  borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
                  cursor: "default",
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, plugin });
                }}
              >
                {/* Name + description */}
                <div style={{ ...COL_NAME, minWidth: 0 }}>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg-base)" }}>
                    {plugin.name}
                  </span>
                  {plugin.description && (
                    <p style={{
                      fontSize: "11px", color: "var(--fg-muted)", margin: "1px 0 0",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {plugin.description}
                    </p>
                  )}
                </div>

                {/* Source badge */}
                <div style={COL_SOURCE}>
                  <SourceBadge marketplace={plugin.marketplace} />
                </div>

                {/* Category */}
                <div style={{ ...COL_CATEGORY, fontSize: "12px", color: "var(--fg-muted)" }}>
                  {plugin.category ?? "—"}
                </div>

                {/* Version */}
                <div style={{ ...COL_VERSION, fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>
                  {update ? (
                    <span>
                      <span style={{ color: "var(--fg-subtle)", textDecoration: "line-through" }}>
                        {plugin.version}
                      </span>
                      <span style={{ color: "var(--accent-text)", marginLeft: 4 }}>
                        → {update.latest_version}
                      </span>
                    </span>
                  ) : (
                    <span style={{ color: "var(--fg-subtle)" }}>{plugin.version}</span>
                  )}
                </div>

                {/* Last updated */}
                <div style={{ ...COL_UPDATED, fontSize: "11px", color: "var(--fg-subtle)" }}>
                  {relativeDate(plugin.installed_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            { label: "Copy name", onClick: () => navigator.clipboard.writeText(contextMenu.plugin.name) },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
