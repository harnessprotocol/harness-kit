import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { ErrorNotice } from "@harness-kit/ui";
import type { ImportError } from "./import-errors";

export type ImportStatus =
  | { state: "importing"; name: string }
  | { state: "success"; name: string }
  | ({ state: "error" } & ImportError);

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

  const progress = status && status.state !== "error" ? status : null;
  const failure = status?.state === "error" ? status : null;

  // The progress region stays mounted so screen readers see its text arrive
  // in an existing region; a polite region inserted with its text is often
  // missed. A failure is an ErrorNotice, whose title is role="alert": the
  // one live region that is announced when inserted with its content. It
  // stays outside any wrapping region so opening Details does not
  // re-announce the notice.
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
      <AnimatePresence>
        {failure && (
          <Reveal key="error">
            <ErrorNotice
              title={failure.action ? `${failure.title} ${failure.action}` : failure.title}
              details={failure.details}
              action={{ label: "Dismiss", onClick: onDismiss }}
            />
          </Reveal>
        )}
      </AnimatePresence>
    </>
  );
}

const TONES = {
  accent: { background: "var(--accent-light)", color: "var(--accent-text)" },
  success: { background: "var(--success-light)", color: "var(--success)" },
} as const;

function Reveal({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      style={{ overflow: "hidden", marginBottom: "12px" }}
    >
      {children}
    </motion.div>
  );
}

function Banner({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <Reveal>
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
    </Reveal>
  );
}
