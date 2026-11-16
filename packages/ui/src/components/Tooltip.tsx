import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
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

const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

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
    style?: CSSProperties;
    "aria-describedby"?: string;
    onMouseEnter?: Handler;
    onMouseLeave?: Handler;
    onFocus?: Handler;
    onBlur?: Handler;
  };
  // A child that takes a `disabled` prop is always wrapped, so toggling it never
  // changes the tree shape (which would remount the child and drop focus).
  // Disabled controls swallow mouse events; the wrapper takes the hover instead.
  const canBeDisabled = childProps.disabled !== undefined;

  const visibleTip = visible
    ? createPortal(
        <span
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

  // Always present, visually hidden: the text reaches assistive tech even when
  // the tooltip never shows (disabled or non-focusable targets).
  const description = content
    ? createPortal(
        <span id={id} style={SR_ONLY}>
          {content}
        </span>,
        document.body,
      )
    : null;

  const existing = childProps["aria-describedby"];
  const described = cloneElement(children, {
    ...(content ? { "aria-describedby": existing ? `${existing} ${id}` : id } : {}),
    ...(canBeDisabled
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
        }),
    onFocus: (e: FocusEvent<Element>) => {
      childProps.onFocus?.(e as never);
      show(e.currentTarget);
    },
    onBlur: (e: FocusEvent<Element>) => {
      childProps.onBlur?.(e as never);
      hide();
    },
  });

  if (canBeDisabled) {
    const width = childProps.style?.width;
    return (
      <span
        tabIndex={-1}
        style={{ display: width === "100%" ? "flex" : "inline-flex", width }}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hide}
      >
        {described}
        {visibleTip}
        {description}
      </span>
    );
  }
  return (
    <>
      {described}
      {visibleTip}
      {description}
    </>
  );
}
