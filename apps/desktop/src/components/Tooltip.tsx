import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;
  delay?: number;
  position?: "top" | "bottom";
  children: React.ReactNode;
}

interface TooltipPos {
  top?: number;
  bottom?: number;
  left: number;
}

export default function Tooltip({ content, delay = 500, position = "top", children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<TooltipPos>({ left: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const maxW = 240;
        const gap = 6;

        // Clamp horizontal center so tooltip never overflows the viewport
        let left = rect.left + rect.width / 2 - maxW / 2;
        if (left < 8) left = 8;
        if (left + maxW > vw - 8) left = vw - maxW - 8;

        if (position === "top") {
          // Pin tooltip bottom to just above the trigger
          setPos({ bottom: window.innerHeight - rect.top + gap, left });
        } else {
          // Pin tooltip top to just below the trigger
          setPos({ top: rect.bottom + gap, left });
        }
      }
      setVisible(true);
    }, delay);
  }, [delay, position]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <span
      ref={containerRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && createPortal(
        <span
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            maxWidth: 240,
            zIndex: 9999,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-base)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            borderRadius: "6px",
            padding: "5px 9px",
            fontSize: "11px",
            lineHeight: 1.45,
            color: "var(--fg-base)",
            pointerEvents: "none",
          }}
        >
          {content}
        </span>,
        document.body,
      )}
    </span>
  );
}
