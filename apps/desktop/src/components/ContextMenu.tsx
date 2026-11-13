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

/**
 * A menu (WAI-ARIA menu pattern): focus moves to the first item on open,
 * Arrow/Home/End move between items, Enter/Space activate, Escape and Tab
 * close it, and focus returns to whatever opened it (AC-61).
 */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    const itemEls = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    itemEls()[0]?.focus();

    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      const els = itemEls();
      const at = els.indexOf(document.activeElement as HTMLElement);
      const focusAt = (i: number) => {
        e.preventDefault();
        els[(i + els.length) % els.length]?.focus();
      };
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        onClose();
      } else if (e.key === "ArrowDown") focusAt(at + 1);
      else if (e.key === "ArrowUp") focusAt(at === -1 ? -1 : at - 1);
      else if (e.key === "Home") focusAt(0);
      else if (e.key === "End") focusAt(-1);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      // Give focus back unless the user already moved it somewhere on purpose
      // (a pointer click elsewhere) — body means nothing else claimed it.
      if (opener instanceof HTMLElement && opener.isConnected && document.activeElement !== opener) {
        const active = document.activeElement;
        if (!active || active === document.body || menuRef.current?.contains(active)) opener.focus();
      }
    };
    // onClose is always () => setContextMenu(null) — stable by contract.
    // Omitting it from deps prevents listener churn on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={menuRef}
      role="menu"
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
            role="separator"
            style={{
              height: "1px",
              background: "var(--border-subtle)",
              margin: "3px 6px",
            }}
          />
        ) : (
          <button
            key={i}
            role="menuitem"
            tabIndex={-1}
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
              color: item.danger ? "var(--danger-text)" : "var(--fg-base)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = item.danger ? "rgba(220,38,38,0.08)" : "var(--hover-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onFocus={(e) => (e.currentTarget.style.background = item.danger ? "rgba(220,38,38,0.08)" : "var(--hover-bg)")}
            onBlur={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
