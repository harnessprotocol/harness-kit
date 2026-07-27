import { StatusChip, type StatusChipVariant } from "@harness-kit/ui";
import type { TrustTier } from "@harness-kit/marketplace-data";

const TRUST_VARIANT: Record<TrustTier, StatusChipVariant> = {
  verified: "success",
  caution: "warning",
  warning: "danger",
  unscanned: "subtle",
};

export function TrustBadge({ tier }: { tier: TrustTier }) {
  return (
    <StatusChip variant={TRUST_VARIANT[tier]} hideDot>
      {tier}
    </StatusChip>
  );
}

export function CategoryBadge({ name }: { name: string }) {
  return (
    <StatusChip variant="subtle" hideDot>
      {name}
    </StatusChip>
  );
}
