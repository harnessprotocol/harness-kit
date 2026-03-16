import { useState, useRef, useEffect } from "react";
import { exportComparisonJson } from "../../lib/tauri";

interface ExportMenuProps {
  comparisonId: string;
}

export default function ExportMenu({ comparisonId }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const json = await exportComparisonJson(comparisonId);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comparison-${comparisonId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const handleCopyJson = async () => {
    setExporting(true);
    try {
      const json = await exportComparisonJson(comparisonId);
      await navigator.clipboard.writeText(json);
      setOpen(false);
    } catch (err) {
      console.error("Copy failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: "11px",
          fontWeight: 500,
          padding: "4px 12px",
          borderRadius: "6px",
          border: "1px solid var(--border-base)",
          background: "transparent",
          color: "var(--fg-muted)",
          cursor: "pointer",
        }}
      >
        Export
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
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <button
            onClick={handleExportJson}
            disabled={exporting}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              fontSize: "12px",
              border: "none",
              background: "transparent",
              color: "var(--fg-base)",
              cursor: exporting ? "wait" : "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Export as JSON
          </button>
          <button
            onClick={handleCopyJson}
            disabled={exporting}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              fontSize: "12px",
              border: "none",
              background: "transparent",
              color: "var(--fg-base)",
              cursor: exporting ? "wait" : "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Copy JSON to clipboard
          </button>
        </div>
      )}
    </div>
  );
}
