import type { HTMLAttributes } from "react";

export type BadgeVariant = "accent" | "success" | "danger" | "warning" | "neutral";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  accent: "badge-accent",
  success: "badge-success",
  danger: "badge-danger",
  warning: "badge-warning",
  neutral: "",
};

/** Typed wrapper over the `.badge` CSS classes. */
export function Badge({ variant = "neutral", className = "", ...rest }: BadgeProps) {
  const cls = ["badge", VARIANT_CLASS[variant], className].filter(Boolean).join(" ");
  return <span className={cls} {...rest} />;
}
