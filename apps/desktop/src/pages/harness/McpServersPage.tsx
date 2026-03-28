import { useState } from "react";
import type { CSSProperties } from "react";
import { useMcpServers } from "../../hooks/useMcpServers";
import type { McpServerEntry } from "../../hooks/useMcpServers";
import McpServerCard from "../../components/mcp/McpServerCard";
import McpServerForm from "../../components/mcp/McpServerForm";
import ConfirmDialog from "../../components/ConfirmDialog";

function tabBtn(active: boolean): CSSProperties {
  return {
    padding: "3px 10px",
    borderRadius: "4px",
    fontSize: "12px",
    border: "none",
    cursor: "pointer",
    background: active ? "var(--bg-surface)" : "transparent",
    color: active ? "var(--fg-base)" : "var(--fg-muted)",
    fontWeight: active ? 500 : 400,
    transition: "all 0.1s",
  };
}

export default function McpServersPage() {
  const {
    servers,
    loading,
    error,
    saving,
    activeSource,
    setActiveSource,
    sourcePath,
    hasHarness,
    addServer,
    updateServer,
    removeServer,
  } = useMcpServers();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<McpServerEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Row 1: title + Add Server button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div>
          <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
            MCP Servers
          </h1>
          <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
            Model Context Protocol servers connected to your AI assistants.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setFormOpen(true)}
          disabled={loading || saving}
        >
          Add Server
        </button>
      </div>

      {/* Row 2: source toggle + source path */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div style={{ display: "inline-flex", gap: "2px", background: "var(--bg-base)", border: "1px solid var(--border-base)", borderRadius: "6px", padding: "2px" }}>
          <button
            type="button"
            onClick={() => setActiveSource("mcp.json")}
            style={tabBtn(activeSource === "mcp.json")}
          >
            mcp.json
          </button>
          <button
            type="button"
            onClick={() => setActiveSource("harness")}
            style={tabBtn(activeSource === "harness")}
            disabled={!hasHarness}
            title={!hasHarness ? "No harness.yaml with mcp-servers found" : undefined}
          >
            harness.yaml
          </button>
        </div>
        {sourcePath && (
          <code style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
            {sourcePath}
          </code>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
      )}

      {/* Error state */}
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

      {/* Empty state */}
      {!loading && !error && servers.length === 0 && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "32px 16px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "0 0 12px" }}>
            No MCP servers configured{activeSource === "harness" ? " in harness.yaml" : ""}.
          </p>
          <button className="btn btn-secondary btn-sm" onClick={() => setFormOpen(true)}>
            Add your first server
          </button>
        </div>
      )}

      {/* Server list */}
      {!loading && !error && servers.length > 0 && (
        <div className="row-list">
          {servers.map((entry) => (
            <McpServerCard
              key={entry.name}
              name={entry.name}
              server={entry.config}
              inBoth={entry.inBoth}
              onEdit={() => { setEditTarget(entry); setFormOpen(true); }}
              onDelete={() => setDeleteTarget(entry.name)}
            />
          ))}
        </div>
      )}

      {/* Add/Edit form modal */}
      <McpServerForm
        open={formOpen}
        mode={editTarget ? "edit" : "add"}
        initialName={editTarget?.name}
        initialServer={editTarget?.config}
        onSave={async (name, server) => {
          try {
            if (editTarget) {
              await updateServer(name, server);
            } else {
              await addServer(name, server);
            }
            setFormOpen(false);
            setEditTarget(null);
          } catch {
            // hook sets error state; keep modal open so user doesn't lose their input
          }
        }}
        onCancel={() => { setFormOpen(false); setEditTarget(null); }}
      />

      {/* Remove confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Remove "${deleteTarget}"?`}
        message={`This will remove the server from ${activeSource === "harness" ? "harness.yaml" : "~/.claude/mcp.json"}.`}
        confirmLabel="Remove"
        confirmVariant="danger"
        onConfirm={async () => {
          if (deleteTarget) await removeServer(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
