import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { writeHarnessFile } from "../lib/tauri";

const MonacoEditor = lazy(() => import("./plugin-explorer/MonacoEditor"));

interface HarnessEditorModalProps {
  open: boolean;
  initialContent: string;
  filePath: string;
  onClose: () => void;
  onSaved: (newContent: string, savedPath: string) => void;
}

export default function HarnessEditorModal({
  open,
  initialContent,
  filePath,
  onClose,
  onSaved,
}: HarnessEditorModalProps) {
  const [content, setContent] = useState(initialContent);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync content when modal opens with new initialContent
  useEffect(() => {
    if (open) {
      setContent(initialContent);
      setDirty(false);
      setSaveError(null);
    }
  }, [open, initialContent]);

  const handleChange = useCallback((value: string) => {
    setContent(value);
    setDirty(true);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const savedPath = await writeHarnessFile(content);
      setDirty(false);
      onSaved(content, savedPath);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }, [content, saving, onSaved]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose, handleSave]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="harness-editor-overlay"
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
          <motion.div
            key="harness-editor-modal"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(90%, 860px)",
              height: "80%",
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
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "1px solid var(--border-base)",
              gap: "12px",
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>
                  harness.yaml
                </span>
                <span style={{ fontSize: "10px", color: "var(--fg-subtle)", fontFamily: "ui-monospace, monospace" }}>
                  {filePath}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {saveError && (
                  <span style={{ fontSize: "11px", color: "var(--danger)" }}>{saveError}</span>
                )}
                {dirty && !saveError && (
                  <span style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>Unsaved changes</span>
                )}
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: dirty && !saving ? "var(--accent)" : "var(--bg-elevated)",
                    color: dirty && !saving ? "var(--accent-text, #fff)" : "var(--fg-subtle)",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: dirty && !saving ? "pointer" : "not-allowed",
                  }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={handleClose}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "24px",
                    height: "24px",
                    borderRadius: "6px",
                    border: "none",
                    background: "transparent",
                    color: "var(--fg-subtle)",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Editor */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <Suspense fallback={
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "12px", color: "var(--fg-subtle)" }}>
                  Loading editor…
                </div>
              }>
                <MonacoEditor
                  filePath="harness.yaml"
                  content={content}
                  onChange={handleChange}
                  onSave={handleSave}
                />
              </Suspense>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
