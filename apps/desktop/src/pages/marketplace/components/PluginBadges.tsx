import { StatusChip, type StatusChipVariant } from "@harness-kit/ui";
import type { Component, ComponentType } from "@harness-kit/shared";

const TRUST_VARIANT: Record<Component["trust_tier"], StatusChipVariant> = {
  official: "subtle",
  verified: "success",
  community: "subtle",
};

export function TrustBadge({ tier }: { tier: Component["trust_tier"] }) {
  return (
    <StatusChip variant={TRUST_VARIANT[tier]} hideDot>
      {tier}
    </StatusChip>
  );
}

export function TypeBadge({ type }: { type: ComponentType }) {
  return (
    <StatusChip variant="subtle" hideDot>
      {type}
    </StatusChip>
  );
}
