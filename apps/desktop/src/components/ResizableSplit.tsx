import { useCallback, useEffect, useRef, useState } from "react";

interface ResizableSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  /** Reserve this many px for the right panel: the left never grows past the rest. */
  minRightWidth?: number;
  /** Names the divider for assistive tech. */
  handleLabel?: string;
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
  minRightWidth,
  handleLabel = "Resize panels",
}: ResizableSplitProps) {
  const [width, setWidth] = useState(() => {
    if (storageKey) {
      const raw = localStorage.getItem(storageKey);
      const parsed = Number(raw);
      if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) return parsed;
    }
    return defaultWidth;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  // The widest the left panel can be: maxWidth, and what is left after minRightWidth.
  // The CSS clamps the same way; the state must too, or keys would grow it unseen.
  const widest = useCallback(() => {
    const container = containerRef.current?.clientWidth ?? 0;
    if (minRightWidth === undefined || container === 0) return maxWidth;
    return Math.max(minWidth, Math.min(maxWidth, container - minRightWidth));
  }, [maxWidth, minWidth, minRightWidth]);

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
      const next = Math.min(widest(), Math.max(minWidth, startWidth.current + e.clientX - startX.current));
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
  }, [width, minWidth, widest, storageKey]);

  // Keyboard: arrows move the divider, Home/End jump to the limits.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 64 : 16;
      let next: number | null = null;
      if (e.key === "ArrowLeft") next = width - step;
      else if (e.key === "ArrowRight") next = width + step;
      else if (e.key === "Home") next = minWidth;
      else if (e.key === "End") next = widest();
      if (next === null) return;
      e.preventDefault();
      setWidth(Math.min(widest(), Math.max(minWidth, next)));
    },
    [width, minWidth, widest],
  );

  const [handleFocused, setHandleFocused] = useState(false);

  // Persist on unmount
  useEffect(
    () => () => {
      if (storageKey) localStorage.setItem(storageKey, String(width));
    },
    [width, storageKey],
  );

  return (
    <div ref={containerRef} style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left panel */}
      <div
        style={{
          width,
          flexShrink: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxWidth: minRightWidth === undefined ? undefined : `calc(100% - ${minRightWidth}px)`,
        }}
      >
        {left}
      </div>

      {/* Drag handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={handleLabel}
        aria-valuenow={width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setHandleFocused(true)}
        onBlur={() => setHandleFocused(false)}
        onMouseDown={onMouseDown}
        style={{
          width: 4,
          flexShrink: 0,
          cursor: "col-resize",
          background: handleFocused ? "var(--accent)" : "transparent",
          outline: "none",
          transition: "background 0.12s",
          zIndex: 1,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = handleFocused ? "var(--accent)" : "transparent"; }}
      />

      {/* Right panel */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {right}
      </div>
    </div>
  );
}
