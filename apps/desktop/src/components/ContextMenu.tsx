import { useEffect, useRef } from "react";

export type ContextMenuItem =
  | { label: string; onClick: () => void; danger?: boolean }
  | { separator: true };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // onClose is always () => setContextMenu(null) — stable by contract.
    // Omitting it from deps prevents listener churn on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: y,
        left: x,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
        boxShadow: "var(--shadow-md)",
        minWidth: "160px",
        zIndex: 200,
        overflow: "hidden",
        padding: "3px",
      }}
    >
      {items.map((item, i) =>
        "separator" in item ? (
          <div
            key={`sep-${i}`}
            style={{
              height: "1px",
              background: "var(--border-subtle)",
              margin: "3px 6px",
            }}
          />
        ) : (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose(); }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 10px",
              fontSize: "12px",
              border: "none",
              borderRadius: "5px",
              background: "transparent",
              color: item.danger ? "var(--danger)" : "var(--fg-base)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = item.danger ? "rgba(220,38,38,0.08)" : "var(--hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
