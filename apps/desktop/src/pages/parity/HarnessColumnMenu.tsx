import { useEffect, useRef } from "react";
import type { HarnessInfo } from "@harness-kit/shared";

interface Props {
  harness: HarnessInfo | null;
  x: number;
  y: number;
  hiddenCount: number;
  onHide: (harnessId: string) => void;
  onShowAll: () => void;
  onClose: () => void;
}

export function HarnessColumnMenu({
  harness,
  x,
  y,
  hiddenCount,
  onHide,
  onShowAll,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!harness) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [harness, onClose]);

  if (!harness) return null;

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 50,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: 4,
    boxShadow: "var(--shadow-popover)",
    minWidth: 200,
  };

  const btnStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "7px 10px",
    background: "transparent",
    border: 0,
    color: "var(--fg-base)",
    fontFamily: "inherit",
    fontSize: 12,
    borderRadius: 5,
    cursor: "pointer",
  };

  return (
    <div ref={ref} style={menuStyle}>
      <button
        style={btnStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--hover-bg)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
        onClick={() => {
          onHide(harness.id);
          onClose();
        }}
      >
        Hide {harness.name}
      </button>

      {hiddenCount > 0 && (
        <>
          <div style={{ height: 1, background: "var(--separator)", margin: "4px 2px" }} />
          <button
            style={{ ...btnStyle, color: "var(--fg-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
            onClick={() => {
              onShowAll();
              onClose();
            }}
          >
            Show all hidden columns ({hiddenCount})
          </button>
        </>
      )}
    </div>
  );
}
