import { useState, useRef, useEffect } from "react";
import type { HistoryEntry } from "../../lib/tauri";

interface VersionHistoryPopoverProps {
  entries: HistoryEntry[];
  loading: boolean;
  onRestore: (content: string) => void;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function VersionHistoryPopover({ entries, loading, onRestore }: VersionHistoryPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  if (entries.length === 0 && !loading) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 28, height: 28, borderRadius: "6px",
          border: "1px solid var(--border-base)",
          background: "var(--bg-elevated)", color: "var(--fg-muted)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "13px",
        }}
        title="Version history"
      >
        {/* Clock icon */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 4.5V8l2.5 1.5" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: "4px",
          background: "var(--bg-elevated)", border: "1px solid var(--border-base)",
          borderRadius: "8px", boxShadow: "var(--shadow-md)",
          width: "260px", maxHeight: "320px", overflowY: "auto",
          zIndex: 20, padding: "3px",
        }}>
          <div style={{
            padding: "6px 10px", fontSize: "10px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.05em",
            color: "var(--fg-subtle)", borderBottom: "1px solid var(--border-subtle)",
          }}>
            Version History
          </div>

          {loading && (
            <div style={{ padding: "12px 10px", fontSize: "12px", color: "var(--fg-subtle)" }}>
              Loading...
            </div>
          )}

          {!loading && entries.map((entry) => (
            <div
              key={entry.timestamp}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 10px", borderRadius: "5px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div>
                <div style={{ fontSize: "12px", color: "var(--fg-base)" }}>
                  {formatRelativeTime(entry.timestamp)}
                </div>
                <div style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>
                  {(new TextEncoder().encode(entry.content).length / 1024).toFixed(1)} KB
                </div>
              </div>
              <button
                onClick={() => { onRestore(entry.content); setOpen(false); }}
                className="btn btn-sm btn-secondary"
                style={{ fontSize: "10px", padding: "2px 8px" }}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
