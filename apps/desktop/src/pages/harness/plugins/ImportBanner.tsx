import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

export type ImportStatus =
  | { state: "importing"; name: string }
  | { state: "success"; name: string }
  | { state: "error"; message: string };

interface ImportBannerProps {
  status: ImportStatus | null;
  onDismiss: () => void;
}

export default function ImportBanner({ status, onDismiss }: ImportBannerProps) {
  useEffect(() => {
    if (status?.state === "success") {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, onDismiss]);

  return (
    <AnimatePresence>
      {status && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          style={{ overflow: "hidden", marginBottom: "12px" }}
        >
          <div
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              ...(status.state === "importing"
                ? {
                    background: "rgba(91,80,232,0.08)",
                    border: "1px solid rgba(91,80,232,0.2)",
                    color: "var(--accent-text)",
                  }
                : status.state === "success"
                  ? {
                      background: "rgba(22,163,74,0.08)",
                      border: "1px solid rgba(22,163,74,0.2)",
                      color: "var(--success)",
                    }
                  : {
                      background: "rgba(220,38,38,0.08)",
                      border: "1px solid rgba(220,38,38,0.2)",
                      color: "var(--danger)",
                    }),
            }}
          >
            <span>
              {status.state === "importing" && `Importing ${status.name}...`}
              {status.state === "success" && `Successfully imported ${status.name}`}
              {status.state === "error" && status.message}
            </span>
            {status.state === "error" && (
              <button
                onClick={onDismiss}
                style={{
                  fontSize: "11px",
                  border: "none",
                  background: "none",
                  color: "var(--danger)",
                  cursor: "pointer",
                  padding: "2px 6px",
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
