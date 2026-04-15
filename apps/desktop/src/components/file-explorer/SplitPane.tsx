import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  getFileExplorerWidth,
  setFileExplorerWidth,
  FILE_EXPLORER_WIDTH_MIN,
  FILE_EXPLORER_WIDTH_MAX,
} from "../../lib/preferences";

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function SplitPane({ left, right, collapsed, onToggleCollapsed }: SplitPaneProps) {
  const [width, setWidth] = useState(getFileExplorerWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
  }, [width]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const next = Math.min(
        FILE_EXPLORER_WIDTH_MAX,
        Math.max(FILE_EXPLORER_WIDTH_MIN, startWidth.current + delta)
      );
      setWidth(next);
    }
    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      setFileExplorerWidth(width);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [width]);

  // Persist width on unmount
  useEffect(() => {
    return () => { setFileExplorerWidth(width); };
  }, [width]);

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", height: "100%", minHeight: 0, overflow: "hidden" }}
    >
      {/* Left panel */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="left-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            style={{
              flexShrink: 0,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              borderRight: "1px solid var(--border-base)",
            }}
          >
            <div style={{ width, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              {left}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resize handle */}
      {!collapsed && (
        <div
          onMouseDown={onMouseDown}
          style={{
            width: "4px",
            flexShrink: 0,
            cursor: "col-resize",
            background: "transparent",
            transition: "background 0.1s",
            zIndex: 1,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        />
      )}

      {/* Right panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
        {/* Collapse toggle button */}
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand panel" : "Collapse panel"}
          style={{
            position: "absolute",
            top: "8px",
            left: "8px",
            zIndex: 10,
            width: "20px",
            height: "20px",
            borderRadius: "4px",
            border: "1px solid var(--border-base)",
            background: "var(--bg-elevated)",
            color: "var(--fg-subtle)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            padding: 0,
          }}
        >
          {collapsed ? "\u203A" : "\u2039"}
        </button>
        {right}
      </div>
    </div>
  );
}
