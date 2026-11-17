import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
  top: number;
  left: number;
}

/** The trigger's box, kept until the tooltip is measured and placed. */
interface Anchor {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

const MAX_W = 240;
const GAP = 6;

// One tooltip at a time. Nested triggers (a badge inside a column header) both
// start their timers on hover; the inner one starts last, so it wins.
let dismissActive: (() => void) | null = null;

/** :focus-visible throws in engines without it (jsdom); show there. */
function isKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

type Handler = ((e: never) => void) | undefined;

export function Tooltip({ content, children, side = "top", delay = 500 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const show = useCallback(
    (target: Element) => {
      if (!content) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const rect = target.getBoundingClientRect();
        setAnchor({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width });
        setPos(null);
        if (dismissActive) dismissActive();
        dismissActive = () => setVisible(false);
        setVisible(true);
      }, delay);
    },
    [content, delay],
  );

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
    setPos(null);
  }, []);

  // Place the tooltip from its real size: centre on the trigger, clamp to the
  // viewport, and flip to the other side when the preferred one has no room.
  useLayoutEffect(() => {
    if (!visible || !anchor || !tipRef.current) return;
    const { width, height } = tipRef.current.getBoundingClientRect();
    let left = anchor.left + anchor.width / 2 - width / 2;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    const need = height + GAP;
    const roomAbove = anchor.top >= need;
    const roomBelow = window.innerHeight - anchor.bottom >= need;
    const below = side === "top" ? !roomAbove && roomBelow : roomBelow || !roomAbove;
    setPos({ top: below ? anchor.bottom + GAP : anchor.top - need, left });
  }, [visible, anchor, side, content]);

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
    "aria-label"?: string;
    children?: unknown;
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
          ref={tipRef}
          style={{
            position: "fixed",
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            visibility: pos ? "visible" : "hidden",
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

  // A tooltip that repeats the child's own name adds nothing to announce.
  const own = childProps["aria-label"] ?? (typeof childProps.children === "string" ? childProps.children : undefined);
  const redundant = own !== undefined && own.trim() === content.trim();

  // Always present, hidden: aria-describedby still resolves a hidden element,
  // so the text reaches assistive tech even when the tooltip never shows
  // (disabled or non-focusable targets).
  const description = content && !redundant
    ? createPortal(
        <span id={id} hidden>
          {content}
        </span>,
        document.body,
      )
    : null;

  const existing = childProps["aria-describedby"];
  const described = cloneElement(children, {
    ...(content && !redundant ? { "aria-describedby": existing ? `${existing} ${id}` : id } : {}),
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
      // Pointer focus (a click) must not pop a tooltip; keyboard focus should.
      if (isKeyboardFocus(e.currentTarget)) show(e.currentTarget);
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
