import { useEffect, useRef } from "react";

interface SaveConfirmPopoverProps {
  variant: "inline" | "critical";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SaveConfirmPopover({
  variant,
  onConfirm,
  onCancel,
}: SaveConfirmPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onClick);
    };
  }, [onCancel]);

  if (variant === "inline") {
    return (
      <div ref={ref} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "11px", color: "var(--fg-muted)", fontWeight: 500 }}>Save?</span>
        <button className="btn btn-sm btn-accent" onClick={onConfirm}>
          Yes
        </button>
        <button className="btn btn-sm btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  // Critical file — popover bubble
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <div
        style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: "6px",
          padding: "10px 14px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--warning, #f59e0b)",
          borderRadius: "8px",
          boxShadow: "var(--shadow-md)",
          minWidth: "220px",
          zIndex: 20,
        }}
      >
        <p
          style={{
            fontSize: "12px",
            color: "var(--fg-base)",
            margin: "0 0 10px",
            lineHeight: 1.4,
          }}
        >
          This file affects plugin behavior. Save changes?
        </p>
        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
          <button className="btn btn-sm btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-sm"
            style={{
              borderColor: "var(--warning, #f59e0b)",
              color: "var(--warning, #f59e0b)",
            }}
            onClick={onConfirm}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
