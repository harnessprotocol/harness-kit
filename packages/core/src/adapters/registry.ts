import type { CompileSurfaceId, SurfaceId } from "../types.js";
import { COMPILE_SURFACE_IDS, isCompileSurface } from "../surfaces/types.js";
import type { AdapterId, HarnessAdapter } from "./adapter.js";
import { claudeCodeAdapter } from "./claude-code/index.js";
import { cursorAdapter } from "./cursor/index.js";
import { copilotAdapter } from "./copilot/index.js";
import { agentsMdAdapter } from "./agents-md/index.js";
import { opencodeAdapter } from "./opencode/index.js";
import { piAdapter } from "./pi/index.js";
import { AGENTS_MD_TARGETS } from "./target-metadata.js";

/**
 * The adapter registry. `compile.ts` looks adapters up here instead of
 * hand-rolling per-target dispatch.
 *
 * OpenCode routes through its dedicated adapter so capability declarations
 * and emitted native configuration stay aligned. Pi remains standalone
 * because it has no legacy compile-target slot.
 */
export const ADAPTERS: HarnessAdapter[] = [
  claudeCodeAdapter,
  cursorAdapter,
  copilotAdapter,
  agentsMdAdapter,
  opencodeAdapter,
  piAdapter,
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
 * Maps every compile-target surface (the existing per-tool compile target
 * id) to the `AdapterId` that implements it. Exhaustive over
 * `CompileSurfaceId`: extending COMPILE_SURFACE_IDS without a mapping here
 * fails to compile. Single source of truth for compile.ts's orchestration —
 * checked against targets.ts's AGENTS_MD_TARGETS below, so it can't drift.
 */
const LEGACY_TARGET_TO_ADAPTER: Record<CompileSurfaceId, AdapterId> = {
  "claude-code": "claude-code",
  cursor: "cursor",
  "copilot-vscode": "copilot",
  codex: "agents-md",
  opencode: "opencode",
  windsurf: "agents-md",
  gemini: "agents-md",
  junie: "agents-md",
};

// Sanity check the derived map agrees with AGENTS_MD_TARGETS at module load.
for (const t of AGENTS_MD_TARGETS.filter((target) => target !== "opencode")) {
  if (LEGACY_TARGET_TO_ADAPTER[t] !== "agents-md") {
    throw new Error(
      `adapter registry: AGENTS_MD_TARGETS includes '${t}' but LEGACY_TARGET_TO_ADAPTER maps it elsewhere`,
    );
  }
}

export function adapterIdForTarget(target: SurfaceId): AdapterId {
  if (!isCompileSurface(target)) {
    throw new Error(
      `No compile adapter is registered for surface '${target}'. Valid targets: ${COMPILE_SURFACE_IDS.join(", ")}`,
    );
  }
  return LEGACY_TARGET_TO_ADAPTER[target];
}

/**
 * Groups a flat list of compile-target surfaces by the adapter that covers
 * them, preserving first-seen order of adapters. Used by compile.ts to
 * dispatch one exportConfig call per adapter, each restricted to its
 * requested subset.
 */
export function groupSurfacesByAdapter(
  targets: SurfaceId[],
): Array<{ adapter: HarnessAdapter; legacyTargets: SurfaceId[] }> {
  const order: AdapterId[] = [];
  const groups = new Map<AdapterId, SurfaceId[]>();

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
