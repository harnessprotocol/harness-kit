import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, CircleAlert } from "lucide-react";
import { Modal } from "@harness-kit/ui";
import { open } from "@tauri-apps/plugin-shell";
import {
  getSystemInfo, submitFeedback,
  type SystemInfo, type FeedbackResult,
} from "../lib/tauri";

// ── Constants ─────────────────────────────────────────────────

const CATEGORIES = [
  { id: "bug_report",       label: "Bug Report" },
  { id: "feature_request",  label: "Feature Request" },
  { id: "general_feedback", label: "General Feedback" },
  { id: "question",         label: "Question" },
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
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [sysInfoExpanded, setSysInfoExpanded] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCategory("bug_report");
    setTitle("");
    setDescription("");
    setResult(null);
    setSubmitting(false);
    setSysInfoExpanded(false);
    getSystemInfo().then(setSysInfo).catch(() => {});
  }, [isOpen]);

  // Bumped on every open and close; a submit that finishes after either is dropped.
  const session = useRef(0);
  useEffect(() => {
    session.current += 1;
  }, [isOpen]);

  const canSubmit =
    title.trim().length >= 3 &&
    description.trim().length >= 10 &&
    sysInfo !== null &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit || !sysInfo) return;
    const mine = session.current;
    setSubmitting(true);
    let res: FeedbackResult;
    try {
      res = await submitFeedback(category, title, description, sysInfo);
    } catch (err) {
      res = { success: false, issueUrl: null, error: err instanceof Error ? err.message : String(err) };
    }
    if (session.current !== mine) return;
    setResult(res);
    setSubmitting(false);
  }

  const footer = result ? undefined : (
    <>
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
          color: canSubmit ? "var(--fg-on-fill)" : "var(--fg-subtle)",
          fontSize: "12px",
          cursor: canSubmit ? "pointer" : "default",
          fontWeight: 500,
        }}
      >
        {submitting ? "Submitting…" : "Submit"}
      </button>
    </>
  );

  return (
    <Modal open={isOpen} onClose={onClose} title="Send Feedback" size="md" footer={footer}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
                        color: category === cat.id ? "var(--fg-on-fill)" : "var(--fg-muted)",
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
                  Title <span style={{ color: "var(--danger)" }}>*</span>
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
                  Description <span style={{ color: "var(--danger)" }}>*</span>
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
                    <ChevronRight
                      size={16} strokeWidth={1.7} aria-hidden="true"
                      style={{ transform: sysInfoExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
                    />
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
            </>
          )}
      </div>
    </Modal>
  );
}

function SuccessState({ result, onClose }: { result: FeedbackResult; onClose: () => void }) {
  if (result.success && result.issueUrl) {
    return (
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <CheckCircle2 size={16} strokeWidth={1.7} aria-hidden="true" style={{ marginBottom: "10px", color: "var(--accent)" }} />
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 6px" }}>Feedback sent</p>
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
      <CircleAlert size={16} strokeWidth={1.7} aria-hidden="true" style={{ marginBottom: "10px", color: "var(--danger)" }} />
      <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-base)", margin: "0 0 4px" }}>Submission failed</p>
      {result.error && (
        <p style={{ fontSize: "11px", color: "var(--fg-muted)", margin: "0 0 12px" }}>{result.error}</p>
      )}
    </div>
  );
}
