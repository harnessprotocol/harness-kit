import type { HTMLAttributes } from "react";

export type StatusChipVariant = "success" | "warning" | "danger" | "subtle";

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: StatusChipVariant;
  /** Hide the leading dot (rare — prefer keeping it for scan-ability). */
  hideDot?: boolean;
}

const VARIANT_CLASS: Record<StatusChipVariant, string> = {
  success: "hk-chip-success",
  warning: "hk-chip-warning",
  danger: "hk-chip-danger",
  subtle: "hk-chip-subtle",
};

/**
 * Tinted background + colored text + a 6px dot. Never a solid-fill pill
 * (DESIGN.md §2/§7). Used for drift/sync/conflict states across Fleet, Drift,
 * Configure.
 */
export function StatusChip({
  variant = "subtle",
  hideDot = false,
  className = "",
  children,
  ...rest
}: StatusChipProps) {
  const cls = ["hk-chip", VARIANT_CLASS[variant], className].filter(Boolean).join(" ");
  return (
    <span className={cls} role="status" {...rest}>
      {!hideDot && <span className="hk-chip-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
