import type { HTMLAttributes } from "react";

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  /** Hover affordance (cursor + elevated shadow on hover). */
  interactive?: boolean;
}

const PAD: Record<CardPadding, string> = {
  none: "0",
  sm: "10px 12px",
  md: "16px 18px",
  lg: "20px 24px",
};

/**
 * Borderless surface primitive. Separation comes from --bg-elevated +
 * --shadow-sm, never a neutral outline (DESIGN.md §1).
 */
export function Card({
  padding = "md",
  interactive = false,
  className = "",
  style,
  ...rest
}: CardProps) {
  const cls = ["hk-card", interactive ? "hk-card-interactive" : "", className]
    .filter(Boolean)
    .join(" ");
  return <div className={cls} style={{ padding: PAD[padding], minWidth: 0, ...style }} {...rest} />;
}
