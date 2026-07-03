import type { Component, ComponentType } from "@harness-kit/shared";

export function TrustBadge({ tier }: { tier: Component["trust_tier"] }) {
  const colors: Record<Component["trust_tier"], { bg: string; color: string }> = {
    official: { bg: "var(--accent-light)", color: "var(--accent-text)" },
    verified: { bg: "var(--success-light)", color: "var(--success)" },
    community: { bg: "var(--bg-base)", color: "var(--fg-subtle)" },
  };
  const c = colors[tier];
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 500,
      padding: "2px 8px",
      borderRadius: "10px",
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.color}30`,
    }}>
      {tier}
    </span>
  );
}

export function TypeBadge({ type }: { type: ComponentType }) {
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 400,
      padding: "2px 8px",
      borderRadius: "10px",
      border: "1px solid var(--border-base)",
      color: "var(--fg-subtle)",
      textTransform: "capitalize",
    }}>
      {type}
    </span>
  );
}
