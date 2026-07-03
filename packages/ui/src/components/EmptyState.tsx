import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** What this surface is for. */
  title: string;
  /** Why it's empty right now. */
  description?: string;
  icon?: ReactNode;
  /** The one action that resolves the empty state. */
  action?: ReactNode;
  className?: string;
}

/**
 * Every empty surface teaches: what it's for, why it's empty, one action
 * (DESIGN.md §4/§7). Never a blank pane.
 */
export function EmptyState({ title, description, icon, action, className = "" }: EmptyStateProps) {
  return (
    <div className={["hk-empty-state", className].filter(Boolean).join(" ")}>
      {icon && (
        <div className="hk-empty-state-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="hk-empty-state-title">{title}</div>
      {description && <div className="hk-empty-state-description">{description}</div>}
      {action && <div className="hk-empty-state-action">{action}</div>}
    </div>
  );
}
