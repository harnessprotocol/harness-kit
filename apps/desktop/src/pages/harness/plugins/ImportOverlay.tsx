import { AnimatePresence, motion } from "framer-motion";
import { FolderDown } from "lucide-react";

interface ImportOverlayProps {
  visible: boolean;
}

/** Shown while the native drag-drop layer reports files over the window. */
export default function ImportOverlay({ visible }: ImportOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          data-testid="plugin-import-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            pointerEvents: "none",
            background: "var(--accent-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{
            padding: "24px 32px",
            borderRadius: "12px",
            background: "var(--bg-surface)",
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            alignItems: "center",
            flexDirection: "column",
            gap: "8px",
          }}>
            <FolderDown size={32} strokeWidth={1.5} style={{ color: "var(--accent)" }} aria-hidden />
            <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--accent-text)" }}>
              Drop a plugin folder to import it
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
