import { AnimatePresence, motion } from "framer-motion";
import type { InstalledPlugin } from "@harness-kit/shared";
import type { HistoryEntry } from "../../lib/tauri";
import ExportMenu from "./ExportMenu";
import SaveConfirmPopover from "./SaveConfirmPopover";
import VersionHistoryPopover from "./VersionHistoryPopover";

interface PluginExplorerHeaderProps {
  plugin: InstalledPlugin;
  dirty: boolean;
  saving: boolean;
  savedRecently: boolean;
  confirmState: "idle" | "pending" | "critical";
  onRequestSave: () => void;
  onConfirmSave: () => void;
  onCancelSave: () => void;
  onRevert: () => void;
  onExportZip: () => void;
  onExportFolder: () => void;
  onClose: () => void;
  historyEntries: HistoryEntry[];
  historyLoading: boolean;
  onRestoreVersion: (content: string) => void;
}

export default function PluginExplorerHeader({
  plugin, dirty, saving, savedRecently,
  confirmState, onRequestSave, onConfirmSave, onCancelSave, onRevert,
  onExportZip, onExportFolder, onClose,
  historyEntries, historyLoading, onRestoreVersion,
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

      {/* Right: save/revert + status + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* Save/Revert/Confirm controls */}
        <AnimatePresence mode="wait">
          {confirmState !== "idle" ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
            >
              <SaveConfirmPopover
                variant={confirmState === "critical" ? "critical" : "inline"}
                onConfirm={onConfirmSave}
                onCancel={onCancelSave}
              />
            </motion.div>
          ) : dirty ? (
            <motion.div
              key="save-controls"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <button
                className="btn btn-sm btn-accent"
                onClick={onRequestSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={onRevert}
                disabled={saving}
              >
                Revert
              </button>
            </motion.div>
          ) : savedRecently ? (
            <motion.span
              key="saved-indicator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                fontSize: "11px",
                color: "var(--success, #22c55e)",
                fontWeight: 500,
              }}
            >
              Saved
            </motion.span>
          ) : null}
        </AnimatePresence>

        {/* Version history */}
        <VersionHistoryPopover
          entries={historyEntries}
          loading={historyLoading}
          onRestore={onRestoreVersion}
        />

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
