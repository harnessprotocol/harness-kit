import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

interface UninstallDialogProps {
  open: boolean;
  pluginName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function UninstallDialog({ open, pluginName, onConfirm, onClose }: UninstallDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300 }}
          />
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            style={{
              position: "fixed",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 400,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-base)",
              borderRadius: "12px",
              padding: "24px",
              zIndex: 310,
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 600, color: "var(--fg-base)" }}>
              Uninstall {pluginName}?
            </h2>
            <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "0 0 20px", lineHeight: 1.5 }}>
              This will remove the plugin from <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>~/.claude/</code>. Cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "7px 16px", background: "transparent",
                  border: "1px solid var(--border-base)", borderRadius: "6px",
                  color: "var(--fg-muted)", fontSize: "13px", cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                style={{
                  padding: "7px 16px", background: "var(--danger)",
                  border: "none", borderRadius: "6px",
                  color: "#fff", fontSize: "13px", fontWeight: 500, cursor: "pointer",
                }}
              >
                Uninstall
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
