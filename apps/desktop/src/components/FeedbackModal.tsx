import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-shell";
import {
  checkGhAuth, getSystemInfo, submitFeedback,
  type GhAuthStatus, type SystemInfo, type FeedbackResult,
} from "../lib/tauri";

// ── Constants ─────────────────────────────────────────────────

const CATEGORIES = [
  { id: "bug_report",       label: "Bug Report",       template: "bug_report.yml" },
  { id: "feature_request",  label: "Feature Request",  template: "feature_request.yml" },
  { id: "general_feedback", label: "General Feedback", template: "general_feedback.yml" },
  { id: "question",         label: "Question",         template: "question.yml" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

// ── Component ─────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open: isOpen, onClose }: Props) {
  const [category, setCategory] = useState<CategoryId>("bug_report");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [ghAuth, setGhAuth] = useState<GhAuthStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [sysInfoExpanded, setSysInfoExpanded] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Reset form state on each open
    setCategory("bug_report");
    setTitle("");
    setDescription("");
    setResult(null);
    setSysInfoExpanded(false);
    // Load system info and gh auth status in parallel
    Promise.all([getSystemInfo(), checkGhAuth()]).then(([info, auth]) => {
      setSysInfo(info);
      setGhAuth(auth);
    }).catch(() => {
      setGhAuth({ available: false, authenticated: false });
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit =
    title.trim().length >= 3 &&
    description.trim().length >= 10 &&
    !submitting;

  const usesBrowser = !ghAuth?.available || !ghAuth?.authenticated;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);

    if (usesBrowser) {
      const cat = CATEGORIES.find(c => c.id === category);
      const params = new URLSearchParams({ template: cat?.template ?? "general_feedback.yml", title: title.trim() });
      await open(`https://github.com/harnessprotocol/harness-kit-feedback/issues/new?${params}`);
      setSubmitting(false);
      onClose();
      return;
    }

    const res = await submitFeedback(category, title, description, sysInfo!);
    setResult(res);
    setSubmitting(false);
  }

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9000,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const card: React.CSSProperties = {
    width: "min(90vw, 500px)",
    maxHeight: "85vh",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-base)",
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "var(--shadow-popover, 0 20px 60px rgba(0,0,0,0.4))",
  };

  return createPortal(
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border-base)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)" }}>Send Feedback</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", padding: "2px", lineHeight: 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
          {result ? (
            <SuccessState result={result} onClose={onClose} />
          ) : (
            <>
              {/* Category selector */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--fg-muted)", marginBottom: "6px" }}>Category</label>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "20px",
                        border: "1px solid",
                        borderColor: category === cat.id ? "var(--accent)" : "var(--border-base)",
                        background: category === cat.id ? "var(--accent)" : "transparent",
                        color: category === cat.id ? "var(--accent-text, #fff)" : "var(--fg-muted)",
                        fontSize: "11px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--fg-muted)", marginBottom: "6px" }}>
                  Title <span style={{ color: "var(--danger, #e53e3e)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Brief summary..."
                  maxLength={120}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-base)",
                    borderRadius: "6px",
                    color: "var(--fg-base)",
                    fontSize: "12px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--fg-muted)", marginBottom: "6px" }}>
                  Description <span style={{ color: "var(--danger, #e53e3e)" }}>*</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the issue, feature, or feedback in detail..."
                  rows={5}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-base)",
                    borderRadius: "6px",
                    color: "var(--fg-base)",
                    fontSize: "12px",
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* System info */}
              {sysInfo && (
                <div>
                  <button
                    onClick={() => setSysInfoExpanded(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-subtle)", fontSize: "11px", padding: 0, display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    <svg
                      width="10" height="10" viewBox="0 0 20 20" fill="currentColor"
                      style={{ transform: sysInfoExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
                    >
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    System info (auto-collected)
                  </button>
                  {sysInfoExpanded && (
                    <pre style={{
                      marginTop: "6px",
                      padding: "8px 10px",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-base)",
                      borderRadius: "6px",
                      fontSize: "10px",
                      color: "var(--fg-muted)",
                      fontFamily: "monospace",
                      whiteSpace: "pre-wrap",
                    }}>
                      {`OS: ${sysInfo.os} ${sysInfo.osVersion}\nArch: ${sysInfo.arch}\nApp: v${sysInfo.appVersion}`}
                    </pre>
                  )}
                </div>
              )}

              {/* Browser fallback notice */}
              {ghAuth && (!ghAuth.available || !ghAuth.authenticated) && (
                <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: 0 }}>
                  {!ghAuth.available
                    ? "GitHub CLI not found — submitting will open GitHub in your browser."
                    : "GitHub CLI is not authenticated — submitting will open GitHub in your browser."}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-base)", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              onClick={onClose}
              style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid var(--border-base)", background: "transparent", color: "var(--fg-muted)", fontSize: "12px", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "none",
                background: canSubmit ? "var(--accent)" : "var(--bg-surface)",
                color: canSubmit ? "var(--accent-text, #fff)" : "var(--fg-subtle)",
                fontSize: "12px",
                cursor: canSubmit ? "pointer" : "default",
                fontWeight: 500,
              }}
            >
              {submitting ? "Submitting…" : usesBrowser ? "Open in Browser" : "Submit"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SuccessState({ result, onClose }: { result: FeedbackResult; onClose: () => void }) {
  if (result.success && result.issueUrl) {
    return (
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <svg width="32" height="32" viewBox="0 0 20 20" fill="var(--accent)" style={{ marginBottom: "10px" }}>
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 6px" }}>Feedback submitted!</p>
        <button
          onClick={() => open(result.issueUrl!)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "11px", textDecoration: "underline", padding: 0 }}
        >
          View issue on GitHub
        </button>
        <div style={{ marginTop: "16px" }}>
          <button onClick={onClose} style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid var(--border-base)", background: "transparent", color: "var(--fg-muted)", fontSize: "12px", cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", padding: "16px 0" }}>
      <svg width="32" height="32" viewBox="0 0 20 20" fill="var(--danger, #e53e3e)" style={{ marginBottom: "10px" }}>
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 4px" }}>Submission failed</p>
      {result.error && (
        <p style={{ fontSize: "11px", color: "var(--fg-muted)", margin: "0 0 12px" }}>{result.error}</p>
      )}
      <button
        onClick={() => open("https://github.com/harnessprotocol/harness-kit-feedback/issues/new")}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "11px", textDecoration: "underline", padding: 0 }}
      >
        Open GitHub in browser instead
      </button>
    </div>
  );
}
