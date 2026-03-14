import type { HTMLAttributes } from "react";

type Variant = "default" | "accent" | "success" | "warning" | "danger";

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: Variant;
};

const variantStyles: Record<Variant, React.CSSProperties> = {
  default: { background: "var(--hk-bg-surface)", color: "var(--hk-fg-muted)", border: "1px solid var(--hk-border)" },
  accent: { background: "var(--hk-accent-light)", color: "var(--hk-accent-fg)", border: "none" },
  success: { background: "#dcfce7", color: "#15803d", border: "none" },
  warning: { background: "#fef9c3", color: "#b45309", border: "none" },
  danger: { background: "#fee2e2", color: "#b91c1c", border: "none" },
};

export function Badge({ variant = "default", style, children, ...props }: Props) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: "11px",
        fontWeight: 500,
        padding: "2px 7px",
        borderRadius: "999px",
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
