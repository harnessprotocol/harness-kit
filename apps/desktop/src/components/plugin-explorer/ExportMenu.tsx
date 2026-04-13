import { useEffect, useRef, useState } from "react";

interface ExportMenuProps {
  onExportZip: () => void;
  onExportFolder: () => void;
}

export default function ExportMenu({ onExportZip, onExportFolder }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          fontSize: "11px",
          fontWeight: 500,
          padding: "4px 10px",
          borderRadius: "5px",
          border: "1px solid var(--border-base)",
          background: "var(--bg-elevated)",
          color: "var(--fg-muted)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        Export
        <svg width="8" height="8" viewBox="0 0 8 8" style={{ color: "var(--fg-subtle)" }}>
          <path
            d="M1 2.5l3 3 3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "4px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-base)",
            borderRadius: "8px",
            boxShadow: "var(--shadow-md)",
            minWidth: "160px",
            zIndex: 10,
            padding: "3px",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => {
              onExportZip();
              setOpen(false);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 10px",
              fontSize: "12px",
              border: "none",
              borderRadius: "5px",
              background: "transparent",
              color: "var(--fg-base)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Export as zip...
          </button>
          <button
            onClick={() => {
              onExportFolder();
              setOpen(false);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 10px",
              fontSize: "12px",
              border: "none",
              borderRadius: "5px",
              background: "transparent",
              color: "var(--fg-base)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Export to folder...
          </button>
        </div>
      )}
    </div>
  );
}
