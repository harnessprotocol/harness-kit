import type { HarnessConfig, TargetPlatform } from "../types.js";
import { groupTargetsByAdapter } from "../adapters/registry.js";
import { getCheckableTargets } from "../compile/check.js";
import type { AdapterContext } from "../adapters/adapter.js";
import type { DriftClass, DriftItem, DriftReport } from "./types.js";

export type {
  DriftClass,
  DriftItem,
  DriftReport,
  FixPlan,
  FixFileChange,
  FixOperation,
  ApplyFixResult,
} from "./types.js";
export { buildFixPlan } from "./plan.js";
export { applyFix, type ApplyFixContext } from "./apply.js";
export {
  detectInstructionDrift,
  classifyInstructionFile,
  stripAllMarkerBlocks,
  toDriftReport,
} from "./detect.js";

function emptyByClass(): Record<DriftClass, DriftItem[]> {
  return {
    missing: [],
    "modified-inside-markers": [],
    "user-modified-outside": [],
    orphaned: [],
  };
}

function mergeReports(reports: DriftReport[]): DriftReport {
  const items = reports.flatMap((r) => r.items);
  const byClass = emptyByClass();
  for (const item of items) {
    byClass[item.class].push(item);
  }
  const hasDrift = reports.some((r) => r.hasDrift);
  return { items, hasDrift, byClass };
}

/**
 * Run drift detection across the adapters that cover `targets`, merging
 * their DriftReports into one.
 *
 * `targets` follows the exact same convention as `compile()` / `checkCompiled()`
 * — the caller (CLI/desktop) says which legacy TargetPlatforms it cares
 * about (typically "whichever targets were actually compiled for this
 * project"), and detection is scoped to those. This mirrors compile.ts's own
 * `groupTargetsByAdapter` dispatch so a target never gets diffed by an
 * adapter it doesn't belong to, and a project that only ever compiled for
 * claude-code doesn't get spurious "missing" drift for cursor/copilot/AGENTS.md
 * files it was never asked to produce.
 *
 * Defaults to `getCheckableTargets()` (all targets) when omitted, matching
 * `checkCompiled`'s existing default-all-targets behavior elsewhere in the
 * compile pipeline.
 */
export async function detectDrift(
  config: HarnessConfig,
  ctx: AdapterContext,
  targets: TargetPlatform[] = getCheckableTargets(),
): Promise<DriftReport> {
  const reports: DriftReport[] = [];

  for (const { adapter, legacyTargets } of groupTargetsByAdapter(targets)) {
    if (!adapter.diff) continue;
    const groupCtx: AdapterContext = { ...ctx, legacyTargets };
    reports.push(await adapter.diff(config, groupCtx));
  }

  return mergeReports(reports);
}
