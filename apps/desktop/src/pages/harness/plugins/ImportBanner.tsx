import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import type { ImportError } from "./import-errors";

export type ImportStatus =
  | { state: "importing"; name: string }
  | { state: "success"; name: string }
  | ({ state: "error" } & ImportError);

interface ImportBannerProps {
  status: ImportStatus | null;
  onDismiss: () => void;
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export default function ImportBanner({ status, onDismiss }: ImportBannerProps) {
  useEffect(() => {
    if (status?.state === "success") {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, onDismiss]);

  const progress = status && status.state !== "error" ? status : null;
  const failure = status?.state === "error" ? status : null;

  // Both live regions stay mounted so screen readers see content arrive in an
  // existing region; a region inserted together with its text is often missed.
  return (
    <>
      <div role="status" aria-live="polite">
        <AnimatePresence>
          {progress && (
            <Banner key="progress" tone={progress.state === "importing" ? "accent" : "success"}>
              <span>
                {progress.state === "importing"
                  ? `Importing ${progress.name}...`
                  : `Successfully imported ${progress.name}`}
              </span>
            </Banner>
          )}
        </AnimatePresence>
      </div>
      <div role="alert">
        <AnimatePresence>
          {failure && (
            <Banner key="error" tone="danger">
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                <span>
                  {failure.title}
                  {failure.action && ` ${failure.action}`}
                </span>
                {failure.details && (
                  <details style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                    <summary style={{ cursor: "pointer" }}>Details</summary>
                    <pre style={{
                      margin: "4px 0 0", fontFamily: MONO, whiteSpace: "pre-wrap", wordBreak: "break-all",
                    }}>
                      {failure.details}
                    </pre>
                  </details>
                )}
              </div>
              <button
                onClick={onDismiss}
                style={{
                  fontSize: "11px", border: "none", background: "none", alignSelf: "flex-start",
                  color: "var(--danger)", cursor: "pointer", padding: "2px 6px",
                }}
              >
                Dismiss
              </button>
            </Banner>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

const TONES = {
  accent: { background: "var(--accent-light)", color: "var(--accent-text)" },
  success: { background: "var(--success-light)", color: "var(--success)" },
  danger: { background: "var(--danger-light)", color: "var(--danger)" },
} as const;

function Banner({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      style={{ overflow: "hidden", marginBottom: "12px" }}
    >
      <div style={{
        padding: "8px 14px",
        borderRadius: "6px",
        fontSize: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        ...TONES[tone],
      }}>
        {children}
      </div>
    </motion.div>
  );
}
