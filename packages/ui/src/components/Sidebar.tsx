import type { HTMLAttributes, ReactNode } from "react";

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/** 216px fixed-width app sidebar. Separation via --bg-sidebar + inset hairline, no hard border. */
export function Sidebar({ children, className = "", ...rest }: SidebarProps) {
  return (
    <nav className={["hk-sidebar", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </nav>
  );
}

export interface NavGroupLabelProps {
  children: ReactNode;
}

export function NavGroupLabel({ children }: NavGroupLabelProps) {
  return <div className="hk-nav-group-label">{children}</div>;
}

export interface NavItemProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}

/**
 * Active state = --accent-light background + 2.5px inset azure rail on the
 * left (DESIGN.md §5). Inactive = --fg-muted, hover -> --bg-elevated + --fg-base.
 */
export function NavItem({ active = false, icon, badge, children, className = "", onKeyDown, ...rest }: NavItemProps) {
  return (
    <div
      role="link"
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : undefined}
      tabIndex={0}
      className={["hk-nav-item", className].filter(Boolean).join(" ")}
      onKeyDown={(e) => {
        // A role="link" div gets no native keyboard activation; forward Enter/Space
        // to the click handler so keyboard and screen-reader users can navigate.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.currentTarget.click();
        }
        onKeyDown?.(e);
      }}
      {...rest}
    >
      {icon && (
        <span className="hk-nav-item-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
      {badge && <span className="hk-nav-item-badge">{badge}</span>}
    </div>
  );
}
