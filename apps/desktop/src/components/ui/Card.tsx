import type { CSSProperties, HTMLAttributes } from "react";

export type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  /** Hover affordance (cursor + transition). */
  interactive?: boolean;
  /** Frosted surface (used by Observatory stat cards). */
  glass?: boolean;
  /** Soft elevation shadow. Defaults to true. */
  elevated?: boolean;
  /** Optional semantic accent bar along the top edge. */
  accentColor?: string;
}

const PAD: Record<CardPadding, string> = {
  none: "0",
  sm: "10px 12px",
  md: "14px 16px",
  lg: "18px 20px",
};

/**
 * Borderless surface primitive. Separation comes from background elevation +
 * soft shadow, never a neutral outline (see the project's borderless rule).
 */
export function Card({
  padding = "md",
  interactive = false,
  glass = false,
  elevated = true,
  accentColor,
  style,
  ...rest
}: CardProps) {
  const composed: CSSProperties = {
    background: glass ? "var(--card-glass)" : "var(--bg-elevated)",
    ...(glass ? { backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" } : {}),
    borderRadius: "12px",
    padding: PAD[padding],
    minWidth: 0,
    ...(elevated ? { boxShadow: "var(--shadow-sm)" } : {}),
    ...(accentColor ? { borderTop: `2px solid ${accentColor}` } : {}),
    ...(interactive ? { cursor: "pointer", transition: "box-shadow 0.2s ease, background 0.2s ease" } : {}),
    ...style,
  };
  return <div style={composed} {...rest} />;
}
