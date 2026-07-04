import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "hk-btn-primary",
  ghost: "hk-btn-ghost",
  danger: "hk-btn-danger",
};

/**
 * Primary interactive control. `primary` = azure fill / white text,
 * `ghost` = elevated surface (borderless — separation via --bg-elevated +
 * --shadow-sm, never an outline), `danger` = tinted danger surface.
 */
export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  ...rest
}: ButtonProps) {
  const cls = [
    "hk-btn",
    VARIANT_CLASS[variant],
    size === "sm" ? "hk-btn-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button className={cls} {...rest} />;
}
