import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--hk-accent)",
    color: "#fff",
    border: "none",
  },
  secondary: {
    background: "var(--hk-bg-surface)",
    color: "var(--hk-fg-base)",
    border: "1px solid var(--hk-border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--hk-fg-muted)",
    border: "none",
  },
  danger: {
    background: "transparent",
    color: "#dc2626",
    border: "1px solid #fca5a5",
  },
};

const sizeStyles: Record<Size, React.CSSProperties> = {
  sm: { fontSize: "12px", padding: "4px 10px", height: "28px" },
  md: { fontSize: "13px", padding: "6px 14px", height: "34px" },
  lg: { fontSize: "14px", padding: "8px 18px", height: "40px" },
};

export function Button({ variant = "secondary", size = "md", style, children, ...props }: Props) {
  return (
    <button
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        borderRadius: "var(--hk-radius)",
        fontWeight: 500,
        cursor: "pointer",
        transition: "opacity 0.15s",
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
