import type { HarnessInfo } from "@harness-kit/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ── Types ────────────────────────────────────────────────────

export interface InvokeDialogProps {
  open: boolean;
  onClose: () => void;
  onInvoke: (harnessId: string, model: string, prompt: string) => void;
  harnesses: HarnessInfo[];
  terminalTitle: string;
}

// ── Styles ───────────────────────────────────────────────────

const styles = {
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  card: {
    width: 460,
    maxWidth: "90vw",
    background: "#1e1c1a",
    borderRadius: 8,
    border: "1px solid #2a2825",
    boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid #2a2825",
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "#f2f1ed",
  },
  closeBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "#a09d98",
    cursor: "pointer",
    padding: 0,
    transition: "background 120ms, color 120ms",
  },
  body: {
    padding: "16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
  },
  fieldLabel: {
    display: "block",
    fontSize: 11,
    fontWeight: 500,
    color: "#a09d98",
    marginBottom: 5,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  select: {
    width: "100%",
    height: 34,
    padding: "0 10px",
    background: "#141210",
    border: "1px solid #2a2825",
    borderRadius: 4,
    color: "#f2f1ed",
    fontSize: 13,
    outline: "none",
    cursor: "pointer",
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
  },
  textarea: {
    width: "100%",
    minHeight: 100,
    padding: "8px 10px",
    background: "#141210",
    border: "1px solid #2a2825",
    borderRadius: 4,
    color: "#f2f1ed",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    resize: "vertical" as const,
    lineHeight: 1.5,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    padding: "12px 16px",
    borderTop: "1px solid #2a2825",
  },
  cancelBtn: {
    height: 32,
    padding: "0 14px",
    border: "1px solid #3a3835",
    borderRadius: 4,
    background: "transparent",
    color: "#a09d98",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 120ms",
  },
  invokeBtn: {
    height: 32,
    padding: "0 16px",
    border: "none",
    borderRadius: 4,
    background: "#7b72f0",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 120ms",
  },
};

// ── Component ────────────────────────────────────────────────

export default function InvokeDialog({
  open,
  onClose,
  onInvoke,
  harnesses,
  terminalTitle,
}: InvokeDialogProps) {
  const [selectedHarness, setSelectedHarness] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when dialog opens.
  useEffect(() => {
    if (open) {
      const first = harnesses[0];
      setSelectedHarness(first?.id ?? "");
      setSelectedModel(first?.defaultModel ?? first?.models[0] ?? "");
      setPrompt("");
      // Auto-focus the prompt textarea.
      requestAnimationFrame(() => promptRef.current?.focus());
    }
  }, [open, harnesses]);

  // Models filtered by selected harness.
  const availableModels = useMemo(() => {
    const harness = harnesses.find((h) => h.id === selectedHarness);
    return harness?.models ?? [];
  }, [harnesses, selectedHarness]);

  // When harness changes, select its default model.
  useEffect(() => {
    const harness = harnesses.find((h) => h.id === selectedHarness);
    if (harness) {
      setSelectedModel(harness.defaultModel ?? harness.models[0] ?? "");
    }
  }, [selectedHarness, harnesses]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        handleInvoke();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedHarness, selectedModel, prompt]);

  function handleInvoke() {
    if (!selectedHarness || !prompt.trim()) return;
    onInvoke(selectedHarness, selectedModel, prompt.trim());
    onClose();
  }

  if (!open) return null;

  const canInvoke = selectedHarness && prompt.trim().length > 0;

  return createPortal(
    <div style={styles.backdrop} onPointerDown={onClose}>
      <div
        style={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={`Invoke in ${terminalTitle}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>Invoke in {terminalTitle}</span>
          <button
            style={styles.closeBtn}
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#2a2825";
              e.currentTarget.style.color = "#f2f1ed";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#a09d98";
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Harness selector */}
          <div>
            <label htmlFor="invoke-harness" style={styles.fieldLabel}>
              Harness
            </label>
            <select
              id="invoke-harness"
              style={styles.select}
              value={selectedHarness}
              onChange={(e) => setSelectedHarness(e.target.value)}
            >
              {harnesses.length === 0 && <option value="">No harnesses detected</option>}
              {harnesses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.authenticated ? "" : " (not authenticated)"}
                </option>
              ))}
            </select>
          </div>

          {/* Model selector */}
          <div>
            <label htmlFor="invoke-model" style={styles.fieldLabel}>
              Model
            </label>
            <select
              id="invoke-model"
              style={styles.select}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={availableModels.length === 0}
            >
              {availableModels.length === 0 && <option value="">No models available</option>}
              {availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt */}
          <div>
            <label htmlFor="invoke-prompt" style={styles.fieldLabel}>
              Prompt
            </label>
            <textarea
              id="invoke-prompt"
              ref={promptRef}
              style={styles.textarea}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the task..."
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#7b72f0";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#2a2825";
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            style={styles.cancelBtn}
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#2a2825";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Cancel
          </button>
          <button
            style={{
              ...styles.invokeBtn,
              ...(!canInvoke ? { opacity: 0.5, pointerEvents: "none" as const } : {}),
            }}
            onClick={handleInvoke}
            disabled={!canInvoke}
            onMouseEnter={(e) => {
              if (canInvoke) e.currentTarget.style.background = "#6b63e0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#7b72f0";
            }}
          >
            Invoke
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
