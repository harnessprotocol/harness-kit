import { AnimatePresence, motion } from "framer-motion";

interface ImportOverlayProps {
  visible: boolean;
}

export default function ImportOverlay({ visible }: ImportOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(91,80,232,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "20px",
              border: "2px dashed var(--accent)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              style={{ color: "var(--accent)" }}
            >
              <path
                d="M12 16V4m0 0l-4 4m4-4l4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20 16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--accent)" }}>
              Drop plugin to import
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
