import type { AdapterId } from "@harness-kit/core";
import type { HarnessInfo } from "@harness-kit/shared";

/**
 * Display metadata for each core AdapterId — name + a short mono monogram
 * (DESIGN.md §6.3 Fleet matrix: "mono monogram tile + name + mono version").
 *
 * `harnessInfoId` cross-references the Rust `detect_harnesses()` probe (a
 * different, coarser id scheme) so we can show a CLI version string sourced
 * from that existing probe rather than re-probing in core (core's fleet
 * report never populates FleetCell.version — see packages/core/src/fleet/report.ts).
 * Adapters with no corresponding detectHarnesses() entry (agents-md, pi) show
 * no version — that's honest, not a bug.
 */
export interface AdapterMeta {
  name: string;
  monogram: string;
  harnessInfoId?: string;
}

export const ADAPTER_META: Record<AdapterId, AdapterMeta> = {
  "claude-code": { name: "Claude Code", monogram: "CC", harnessInfoId: "claude" },
  cursor: { name: "Cursor", monogram: "CU", harnessInfoId: "cursor-agent" },
  copilot: { name: "GitHub Copilot", monogram: "GH", harnessInfoId: "copilot" },
  opencode: { name: "OpenCode", monogram: "OC", harnessInfoId: "opencode" },
  pi: { name: "Pi", monogram: "PI" },
  "agents-md": { name: "AGENTS.md tools", monogram: "AM" },
};

/** Look up a version string for `adapterId` from the detectHarnesses() result set. */
export function versionForAdapter(adapterId: AdapterId, harnesses: HarnessInfo[]): string | undefined {
  const meta = ADAPTER_META[adapterId];
  if (!meta.harnessInfoId) return undefined;
  return harnesses.find((h) => h.id === meta.harnessInfoId)?.version;
}
