import type { InstalledPlugin } from "@harness-kit/shared";
import ExportMenu from "./ExportMenu";

interface PluginExplorerHeaderProps {
  plugin: InstalledPlugin;
  dirty: boolean;
  saving: boolean;
  onExportZip: () => void;
  onExportFolder: () => void;
  onClose: () => void;
}

export default function PluginExplorerHeader({
  plugin, dirty, saving,
  onExportZip, onExportFolder, onClose,
}: PluginExplorerHeaderProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: "1px solid var(--border-base)",
      flexShrink: 0,
    }}>
      {/* Left: metadata */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--fg-base)" }}>
          {plugin.name}
        </span>
        <span style={{
          fontSize: "11px", fontFamily: "ui-monospace, monospace",
          padding: "1px 6px", borderRadius: "4px",
          background: "var(--bg-elevated)", color: "var(--fg-subtle)",
          border: "1px solid var(--border-subtle)",
        }}>
          {plugin.version}
        </span>
        {plugin.category && (
          <span style={{
            fontSize: "10px", fontWeight: 500, padding: "1px 7px", borderRadius: "10px",
            background: "var(--bg-elevated)", color: "var(--fg-muted)",
            border: "1px solid var(--border-base)",
          }}>
            {plugin.category}
          </span>
        )}
      </div>

      {/* Right: status + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* Save indicator */}
        {(dirty || saving) && (
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: saving ? "var(--fg-subtle)" : "var(--accent)",
            animation: dirty && !saving ? "pulse 1.5s ease-in-out infinite" : undefined,
          }} title={saving ? "Saving..." : "Unsaved changes"} />
        )}

        <ExportMenu onExportZip={onExportZip} onExportFolder={onExportFolder} />

        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: "6px",
            border: "1px solid var(--border-base)",
            background: "var(--bg-elevated)", color: "var(--fg-muted)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px",
          }}
          title="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}
