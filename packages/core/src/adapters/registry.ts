import type { TargetPlatform } from "../types.js";
import type { AdapterId, HarnessAdapter } from "./adapter.js";
import { claudeCodeAdapter } from "./claude-code/index.js";
import { cursorAdapter } from "./cursor/index.js";
import { copilotAdapter } from "./copilot/index.js";
import { agentsMdAdapter } from "./agents-md/index.js";
import { AGENTS_MD_TARGETS } from "./target-metadata.js";

/**
 * The adapter registry. `compile.ts` looks adapters up here instead of
 * hand-rolling per-target dispatch.
 *
 * Only adapters with a REAL exportConfig exist here this WP. `pi` is sized
 * into the `AdapterId` enum (see adapter.ts) for a future WP but has no
 * registered adapter yet.
 */
export const ADAPTERS: HarnessAdapter[] = [
  claudeCodeAdapter,
  cursorAdapter,
  copilotAdapter,
  agentsMdAdapter,
];

const ADAPTERS_BY_ID = new Map<AdapterId, HarnessAdapter>(
  ADAPTERS.map((a) => [a.id, a]),
);

export function getAdapter(id: AdapterId): HarnessAdapter {
  const adapter = ADAPTERS_BY_ID.get(id);
  if (!adapter) throw new Error(`Unknown adapter: ${id}`);
  return adapter;
}

export function getAllAdapters(): HarnessAdapter[] {
  return ADAPTERS;
}

/**
 * Maps every legacy `TargetPlatform` (the existing per-tool compile target
 * id, unchanged by this refactor) to the `AdapterId` that now implements it.
 * Single source of truth for compile.ts's orchestration — derived from
 * targets.ts's AGENTS_MD_TARGETS rather than hardcoded, so it can't drift.
 */
const LEGACY_TARGET_TO_ADAPTER: Record<TargetPlatform, AdapterId> = {
  "claude-code": "claude-code",
  cursor: "cursor",
  copilot: "copilot",
  codex: "agents-md",
  opencode: "agents-md",
  windsurf: "agents-md",
  gemini: "agents-md",
  junie: "agents-md",
};

// Sanity check the derived map agrees with AGENTS_MD_TARGETS at module load.
for (const t of AGENTS_MD_TARGETS) {
  if (LEGACY_TARGET_TO_ADAPTER[t] !== "agents-md") {
    throw new Error(
      `adapter registry: AGENTS_MD_TARGETS includes '${t}' but LEGACY_TARGET_TO_ADAPTER maps it elsewhere`,
    );
  }
}

export function adapterIdForTarget(target: TargetPlatform): AdapterId {
  return LEGACY_TARGET_TO_ADAPTER[target];
}

/**
 * Groups a flat list of legacy targets by the adapter that covers them,
 * preserving first-seen order of adapters. Used by compile.ts to dispatch
 * one exportConfig call per adapter, each restricted to its requested subset.
 */
export function groupTargetsByAdapter(
  targets: TargetPlatform[],
): Array<{ adapter: HarnessAdapter; legacyTargets: TargetPlatform[] }> {
  const order: AdapterId[] = [];
  const groups = new Map<AdapterId, TargetPlatform[]>();

  for (const target of targets) {
    const adapterId = adapterIdForTarget(target);
    if (!groups.has(adapterId)) {
      groups.set(adapterId, []);
      order.push(adapterId);
    }
    groups.get(adapterId)!.push(target);
  }

  return order.map((adapterId) => ({
    adapter: getAdapter(adapterId),
    legacyTargets: groups.get(adapterId)!,
  }));
}
