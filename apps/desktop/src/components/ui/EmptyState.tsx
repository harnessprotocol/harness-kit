import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Optional leading glyph/icon (SVG node). */
  icon?: ReactNode;
  /** Optional action, e.g. a <Button>. */
  action?: ReactNode;
}

/** Centered empty/zero-state placeholder. */
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "8px",
        padding: "48px 24px",
        color: "var(--fg-muted)",
      }}
    >
      {icon && <div style={{ color: "var(--fg-subtle)", marginBottom: "4px" }}>{icon}</div>}
      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg-base)" }}>{title}</div>
      {description && (
        <div style={{ fontSize: "12px", maxWidth: "42ch", lineHeight: 1.5 }}>{description}</div>
      )}
      {action && <div style={{ marginTop: "8px" }}>{action}</div>}
    </div>
  );
}
