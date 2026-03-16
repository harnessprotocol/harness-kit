import { useState, useRef, useCallback, useEffect } from "react";

interface TooltipProps {
  content: string;
  delay?: number;
  position?: "top" | "bottom";
  children: React.ReactNode;
}

export default function Tooltip({ content, delay = 500, position = "top", children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  // Cancel pending timer on unmount to avoid setState after unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            [position === "top" ? "bottom" : "top"]: "calc(100% + 4px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-base)",
            boxShadow: "var(--shadow-md)",
            borderRadius: "5px",
            padding: "4px 8px",
            fontSize: "11px",
            color: "var(--fg-base)",
            whiteSpace: "nowrap",
            maxWidth: "200px",
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
