import type { DriftClass } from "@harness-kit/core";
import type { StatusChipVariant } from "@harness-kit/ui";

/**
 * DESIGN.md §6.3 names four classes as repairable-inside-markers /
 * user-edited-outside / missing / orphaned — core's DriftClass spells the
 * middle two slightly differently (modified-inside-markers /
 * user-modified-outside). This maps core's class to the display label
 * DESIGN.md specifies, without renaming the core type.
 */
export const CLASS_LABEL: Record<DriftClass, string> = {
  missing: "Missing",
  "modified-inside-markers": "Repairable",
  "user-modified-outside": "User-edited",
  orphaned: "Orphaned",
};

export const CLASS_VARIANT: Record<DriftClass, StatusChipVariant> = {
  missing: "warning",
  "modified-inside-markers": "warning",
  "user-modified-outside": "danger",
  orphaned: "subtle",
};

/** Only these three classes are ever auto-fixable — user-modified-outside
 *  items are NEVER offered a Fix button (DESIGN.md: "never a silent overwrite"). */
export function isRepairable(cls: DriftClass): boolean {
  return cls !== "user-modified-outside";
}
