import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { listInstalledPlugins } from "../../lib/tauri";
import type { InstalledPlugin } from "@harness-kit/shared";
import { usePluginExplorer } from "../../hooks/usePluginExplorer";
import { getAvailableViewModes, getDefaultViewMode } from "../../lib/viewModes";
import type { FileEditorState } from "../../hooks/useFileEditor";
import SplitPane from "../../components/file-explorer/SplitPane";
import EditorPane from "../../components/file-explorer/EditorPane";
import FileTree from "../../components/plugin-explorer/FileTree";
import ExportMenu from "../../components/plugin-explorer/ExportMenu";
import SaveConfirmPopover from "../../components/plugin-explorer/SaveConfirmPopover";
import VersionHistoryPopover from "../../components/plugin-explorer/VersionHistoryPopover";

export default function PluginExplorerPage() {
  const { pluginName } = useParams<{ pluginName: string }>();
  const navigate = useNavigate();
  const [plugin, setPlugin] = useState<InstalledPlugin | null>(null);
  const [loadingPlugin, setLoadingPlugin] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState("editor");

  // Load the plugin by name
  useEffect(() => {
    if (!pluginName) return;
    setLoadingPlugin(true);
    listInstalledPlugins()
      .then((plugins) => {
        const found = plugins.find((p) => p.name === decodeURIComponent(pluginName));
        setPlugin(found ?? null);
      })
      .catch(() => setPlugin(null))
      .finally(() => setLoadingPlugin(false));
  }, [pluginName]);

  const explorer = usePluginExplorer(plugin, plugin !== null);

  // Update view mode when file selection changes
  useEffect(() => {
    if (explorer.selectedPath) {
      setViewMode(getDefaultViewMode(explorer.selectedPath));
    }
  }, [explorer.selectedPath]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        explorer.requestSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [explorer]);

  // Adapt usePluginExplorer to FileEditorState interface
  const editorState: FileEditorState = useMemo(() => ({
    content: explorer.fileContent,
    originalContent: null,
    loading: explorer.fileLoading,
    saving: explorer.saving,
    savedRecently: explorer.savedRecently,
    error: explorer.error,
    isDirty: explorer.dirty,
    updateContent: explorer.updateContent,
    saveFile: explorer.saveFile,
    revertFile: explorer.revertFile,
    reload: () => {},
  }), [explorer]);

  const availableModes = getAvailableViewModes(explorer.selectedPath);

  // Toolbar actions: save/revert, version history, export
  const toolbarActions = (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {/* Save confirm popover */}
      <AnimatePresence mode="wait">
        {explorer.confirmState !== "idle" ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.15 }}
          >
            <SaveConfirmPopover
              variant={explorer.confirmState === "critical" ? "critical" : "inline"}
              onConfirm={explorer.confirmSave}
              onCancel={explorer.cancelSave}
            />
          </motion.div>
        ) : explorer.savedRecently ? (
          <motion.span
            key="saved-indicator"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ fontSize: "11px", color: "var(--success, #22c55e)", fontWeight: 500 }}
          >
            Saved
          </motion.span>
        ) : null}
      </AnimatePresence>

      <VersionHistoryPopover
        entries={explorer.historyEntries}
        loading={explorer.historyLoading}
        onRestore={explorer.restoreVersion}
      />

      <ExportMenu
        onExportZip={explorer.exportAsZip}
        onExportFolder={explorer.exportToFolder}
      />
    </div>
  );

  // ── Left panel ──────────────────────────────────────────────

  const leftPanel = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* Back link */}
      <button
        onClick={() => navigate("/harness/plugins")}
        style={{
          display: "flex", alignItems: "center", gap: "4px",
          padding: "8px 12px 4px",
          background: "none", border: "none", cursor: "pointer",
          fontSize: "11px", color: "var(--fg-subtle)",
          textAlign: "left",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Installed Plugins
      </button>

      {/* Plugin metadata */}
      {plugin && (
        <div style={{ padding: "6px 12px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>
              {plugin.name}
            </span>
            <span style={{
              fontSize: "10px", fontFamily: "ui-monospace, monospace",
              padding: "1px 5px", borderRadius: "4px",
              background: "var(--bg-elevated)", color: "var(--fg-subtle)",
              border: "1px solid var(--border-subtle)",
            }}>
              {plugin.version}
            </span>
          </div>
          {plugin.category && (
            <span style={{
              fontSize: "10px", fontWeight: 500, color: "var(--fg-muted)",
              display: "inline-block", marginTop: "2px",
            }}>
              {plugin.category}
            </span>
          )}
        </div>
      )}

      {/* File tree */}
      {explorer.tree && (
        <FileTree
          tree={explorer.tree}
          selectedPath={explorer.selectedPath}
          onSelectFile={explorer.selectFile}
        />
      )}
    </div>
  );

  // ── Loading / not found states ──────────────────────────────

  if (loadingPlugin) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--fg-subtle)", fontSize: "13px" }}>
        Loading plugin...
      </div>
    );
  }

  if (!plugin) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "8px" }}>
        <p style={{ fontSize: "13px", color: "var(--fg-muted)" }}>
          Plugin "{pluginName}" not found.
        </p>
        <button
          onClick={() => navigate("/harness/plugins")}
          style={{
            fontSize: "12px", color: "var(--accent-text)", background: "none",
            border: "none", cursor: "pointer", textDecoration: "underline",
          }}
        >
          Back to Installed Plugins
        </button>
      </div>
    );
  }

  if (explorer.loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--fg-subtle)", fontSize: "13px" }}>
        Loading plugin files...
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────

  return (
    <SplitPane
      left={leftPanel}
      right={
        <EditorPane
          filePath={explorer.selectedPath}
          editor={editorState}
          viewMode={viewMode}
          availableModes={availableModes}
          onViewModeChange={setViewMode}
          toolbarActions={toolbarActions}
        />
      }
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((c) => !c)}
    />
  );
}
