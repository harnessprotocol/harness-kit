import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { getPermissionMode, setPermissionModeAcked } from "../lib/preferences";

const MODE_LABELS: Record<string, { name: string; description: string }> = {
  skip: {
    name: "Skip All Permissions",
    description:
      "Claude can write files, run shell commands, and access your system without any confirmation prompts.",
  },
  auto: {
    name: "Auto",
    description:
      "Claude uses AI classifiers to approve non-destructive actions automatically, while prompting for higher-risk ones.",
  },
  "allowed-tools": {
    name: "Allowed Tools",
    description:
      "Only tools on your allow list run without prompting. Everything else requires approval in the terminal.",
  },
};

interface FirstRunPermissionModalProps {
  onProceed: () => void;
}

export default function FirstRunPermissionModal({ onProceed }: FirstRunPermissionModalProps) {
  const navigate = useNavigate();
  const mode = getPermissionMode();
  const info = MODE_LABELS[mode] ?? MODE_LABELS.skip;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        handleProceed();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleProceed() {
    setPermissionModeAcked();
    onProceed();
  }

  function handleChange() {
    navigate("/security/permissions");
  }

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: 400,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-base)",
          borderRadius: "12px",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Amber accent bar */}
        <div style={{ height: "3px", background: "var(--warning)" }} />

        <div style={{ padding: "20px 22px 22px" }}>
          {/* Header */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{
              fontSize: "14px", fontWeight: 600,
              color: "var(--fg-base)", letterSpacing: "-0.2px",
              marginBottom: "4px",
            }}>
              Before your first task runs
            </div>
            <div style={{ fontSize: "12px", color: "var(--fg-muted)", lineHeight: 1.5 }}>
              HarnessKit will use the following permission mode:
            </div>
          </div>

          {/* Mode card */}
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-base)",
            borderLeft: "3px solid var(--warning)",
            borderRadius: "8px",
            padding: "12px 14px",
            marginBottom: "14px",
          }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg-base)", marginBottom: "4px" }}>
              {info.name}
            </div>
            <div style={{ fontSize: "11px", color: "var(--fg-muted)", lineHeight: 1.5 }}>
              {info.description}
            </div>
          </div>

          {/* Footer note */}
          <div style={{ fontSize: "11px", color: "var(--fg-subtle)", marginBottom: "18px", lineHeight: 1.5 }}>
            You can change this at any time in{" "}
            <button
              onClick={handleChange}
              style={{
                background: "none", border: "none", padding: 0,
                color: "var(--accent-text)", cursor: "pointer",
                fontSize: "11px", fontWeight: 500, textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Security → Permissions
            </button>
            .
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              onClick={handleChange}
              style={{
                fontSize: "12px", fontWeight: 500, padding: "6px 14px",
                borderRadius: "6px", border: "1px solid var(--border-base)",
                background: "transparent", color: "var(--fg-muted)",
                cursor: "pointer",
              }}
            >
              Change it now
            </button>
            <button
              onClick={handleProceed}
              style={{
                fontSize: "12px", fontWeight: 500, padding: "6px 16px",
                borderRadius: "6px", border: "none",
                background: "var(--accent)", color: "#fff",
                cursor: "pointer",
              }}
            >
              Got it, proceed
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
