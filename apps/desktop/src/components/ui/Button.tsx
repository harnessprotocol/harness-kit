import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "accent" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  accent: "btn-accent",
  danger: "btn-danger",
  ghost: "", // base .btn is transparent with a transparent border
};

/** Typed wrapper over the `.btn` CSS classes for consistent buttons. */
export function Button({ variant = "secondary", size = "md", className = "", ...rest }: ButtonProps) {
  const cls = ["btn", VARIANT_CLASS[variant], size === "sm" ? "btn-sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button className={cls} {...rest} />;
}
