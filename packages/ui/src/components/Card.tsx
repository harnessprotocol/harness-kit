import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  hoverable?: boolean;
};

export function Card({ hoverable = false, style, children, ...props }: Props) {
  return (
    <div
      style={{
        background: "var(--hk-bg-surface)",
        border: "1px solid var(--hk-border)",
        borderRadius: "var(--hk-radius-lg)",
        padding: "16px",
        transition: hoverable ? "border-color 0.15s, box-shadow 0.15s" : undefined,
        cursor: hoverable ? "pointer" : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
