import type { InstalledPlugin } from "@harness-kit/shared";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect } from "react";
import { usePluginExplorer } from "../../hooks/usePluginExplorer";
import FileTree from "./FileTree";
import FileViewer from "./FileViewer";
import PluginExplorerHeader from "./PluginExplorerHeader";

interface PluginExplorerModalProps {
  plugin: InstalledPlugin | null;
  onClose: () => void;
}

export default function PluginExplorerModal({ plugin, onClose }: PluginExplorerModalProps) {
  const open = plugin !== null;
  const explorer = usePluginExplorer(plugin, open);

  // Close handler with auto-save
  const handleClose = useCallback(async () => {
    if (explorer.dirty) {
      await explorer.saveFile();
    }
    onClose();
  }, [explorer, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        explorer.requestSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose, explorer]);

  return (
    <AnimatePresence>
      {open && plugin && (
        /* Full-overlay container — covers the content area, not the viewport */
        <motion.div
          key="explorer-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleClose}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Modal */}
          <motion.div
            key="explorer-modal"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(90%, 1200px)",
              height: "85%",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-base)",
              borderRadius: "12px",
              zIndex: 210,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <PluginExplorerHeader
              plugin={plugin}
              dirty={explorer.dirty}
              saving={explorer.saving}
              savedRecently={explorer.savedRecently}
              confirmState={explorer.confirmState}
              onRequestSave={explorer.requestSave}
              onConfirmSave={explorer.confirmSave}
              onCancelSave={explorer.cancelSave}
              onRevert={explorer.revertFile}
              onExportZip={explorer.exportAsZip}
              onExportFolder={explorer.exportToFolder}
              onClose={handleClose}
              historyEntries={explorer.historyEntries}
              historyLoading={explorer.historyLoading}
              onRestoreVersion={explorer.restoreVersion}
            />

            {/* Body */}
            {explorer.loading ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--fg-subtle)",
                  fontSize: "13px",
                }}
              >
                Loading plugin files...
              </div>
            ) : explorer.error && !explorer.tree ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--danger)",
                  fontSize: "13px",
                }}
              >
                {explorer.error}
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                {/* Left panel: file tree */}
                <div
                  style={{
                    width: "250px",
                    flexShrink: 0,
                    borderRight: "1px solid var(--border-base)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  {explorer.tree && (
                    <FileTree
                      tree={explorer.tree}
                      selectedPath={explorer.selectedPath}
                      onSelectFile={explorer.selectFile}
                    />
                  )}
                </div>

                {/* Right panel: file viewer */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    minHeight: 0,
                  }}
                >
                  <FileViewer
                    filePath={explorer.selectedPath}
                    content={explorer.fileContent}
                    loading={explorer.fileLoading}
                    onChange={explorer.updateContent}
                    onSave={explorer.saveFile}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
