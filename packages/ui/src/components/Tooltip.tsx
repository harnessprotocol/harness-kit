import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

export interface TooltipProps {
  /** Empty string shows nothing, so a conditional tooltip needs no second code path. */
  content: string;
  /** Exactly one element. A disabled child is wrapped so hover still reaches the tooltip. */
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom";
  /** Milliseconds before the tooltip shows. Default 500. */
  delay?: number;
}

interface TooltipPos {
  top?: number;
  bottom?: number;
  left: number;
}

const MAX_W = 240;
const GAP = 6;

// One tooltip at a time. Nested triggers (a badge inside a column header) both
// start their timers on hover; the inner one starts last, so it wins.
let dismissActive: (() => void) | null = null;

type Handler = ((e: never) => void) | undefined;

export function Tooltip({ content, children, side = "top", delay = 500 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<TooltipPos>({ left: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const show = useCallback(
    (target: Element) => {
      if (!content) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const rect = target.getBoundingClientRect();
        // Clamp the horizontal centre so the tooltip never overflows the viewport.
        let left = rect.left + rect.width / 2 - MAX_W / 2;
        if (left < 8) left = 8;
        if (left + MAX_W > window.innerWidth - 8) left = window.innerWidth - MAX_W - 8;
        if (side === "top") setPos({ bottom: window.innerHeight - rect.top + GAP, left });
        else setPos({ top: rect.bottom + GAP, left });
        if (dismissActive) dismissActive();
        dismissActive = () => setVisible(false);
        setVisible(true);
      }, delay);
    },
    [content, delay, side],
  );

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, hide]);

  const childProps = children.props as {
    disabled?: boolean;
    onMouseEnter?: Handler;
    onMouseLeave?: Handler;
    onFocus?: Handler;
    onBlur?: Handler;
  };
  const disabled = childProps.disabled === true;

  const tip = visible
    ? createPortal(
        <span
          id={id}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            maxWidth: MAX_W,
            zIndex: 9999,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-base)",
            boxShadow: "var(--shadow-popover)",
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
      )
    : null;

  const described = cloneElement(children, {
    "aria-describedby": visible ? id : (children.props["aria-describedby"] as string | undefined),
    ...(disabled
      ? {}
      : {
          onMouseEnter: (e: MouseEvent<Element>) => {
            childProps.onMouseEnter?.(e as never);
            show(e.currentTarget);
          },
          onMouseLeave: (e: MouseEvent<Element>) => {
            childProps.onMouseLeave?.(e as never);
            hide();
          },
          onFocus: (e: FocusEvent<Element>) => {
            childProps.onFocus?.(e as never);
            show(e.currentTarget);
          },
          onBlur: (e: FocusEvent<Element>) => {
            childProps.onBlur?.(e as never);
            hide();
          },
        }),
  });

  if (disabled) {
    return (
      <span
        tabIndex={-1}
        style={{ display: "inline-flex" }}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hide}
      >
        {described}
        {tip}
      </span>
    );
  }
  return (
    <>
      {described}
      {tip}
    </>
  );
}
