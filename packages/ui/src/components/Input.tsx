import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement>;

export function Input({ style, ...props }: Props) {
  return (
    <input
      style={{
        background: "var(--hk-bg-elevated)",
        border: "1px solid var(--hk-border)",
        borderRadius: "var(--hk-radius)",
        color: "var(--hk-fg-base)",
        fontSize: "13px",
        padding: "6px 10px",
        height: "34px",
        width: "100%",
        outline: "none",
        transition: "border-color 0.15s",
        ...style,
      }}
      {...props}
    />
  );
}
