import { useCallback, useEffect, useRef, useState } from "react";

interface ResizableSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
}

/**
 * Generic two-panel horizontal split with a draggable divider.
 * Width persists to localStorage when storageKey is provided.
 */
export default function ResizableSplit({
  left,
  right,
  defaultWidth = 260,
  minWidth = 160,
  maxWidth = 520,
  storageKey,
}: ResizableSplitProps) {
  const [width, setWidth] = useState(() => {
    if (storageKey) {
      const raw = localStorage.getItem(storageKey);
      const parsed = Number(raw);
      if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) return parsed;
    }
    return defaultWidth;
  });

  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
    },
    [width],
  );

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const next = Math.min(maxWidth, Math.max(minWidth, startWidth.current + e.clientX - startX.current));
      setWidth(next);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      if (storageKey) localStorage.setItem(storageKey, String(width));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width, minWidth, maxWidth, storageKey]);

  // Persist on unmount
  useEffect(
    () => () => {
      if (storageKey) localStorage.setItem(storageKey, String(width));
    },
    [width, storageKey],
  );

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left panel */}
      <div style={{ width, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {left}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          width: 4,
          flexShrink: 0,
          cursor: "col-resize",
          background: "transparent",
          transition: "background 0.12s",
          zIndex: 1,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      />

      {/* Right panel */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {right}
      </div>
    </div>
  );
}
