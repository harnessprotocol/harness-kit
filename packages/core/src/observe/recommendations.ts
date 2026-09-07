import type { HarnessConfig } from "../types.js";
import type { HarnessResourceKind } from "../portability/types.js";
import type { SurfaceId } from "../surfaces/types.js";
import { getSurface } from "../surfaces/registry.js";
import type { MachineInventory } from "./machine-inventory.js";

/**
 * Recommendations (AC-10). Two deterministic sources, and only two — this is
 * not an editorial catalog of things we think you would like:
 *
 * 1. **machine-gap** — a resource on one surface and reachably absent on
 *    another. Read straight from `MachineInventory.gaps`, which already
 *    applies every "is this actually closable" rule, so a recommendation can
 *    never propose something the grid itself calls unreachable.
 * 2. **baseline-gap** — a resource the team's git-hosted `harness.yaml`
 *    declares and this machine does not have ANYWHERE. Scoped to "anywhere"
 *    on purpose: a baseline says what a machine should have, not which
 *    surface should have it, so having it on one surface satisfies the
 *    baseline and any remaining spread is a machine gap, reported once by
 *    source 1 rather than twice by both.
 *
 * Pure: no IO, no clock. The caller loads and parses the baseline.
 */

export type RecommendationSource = "machine-gap" | "baseline-gap";

export interface Recommendation {
  source: RecommendationSource;
  kind: HarnessResourceKind;
  /** `${kind}:${lowercased name}` — joins to a grid row when one exists. */
  identityKey: string;
  /** Display name, case preserved. */
  name: string;
  /** One line, already phrased for a user. */
  summary: string;
  /** Surfaces that already have it (empty for a baseline gap). */
  presentOn: SurfaceId[];
  /** Surfaces it could be added to. */
  missingOn: SurfaceId[];
}

/** Surfaces that could hold this kind: detected, and managing a store for it. */
function candidateSurfaces(
  inventory: MachineInventory,
  kind: HarnessResourceKind,
): SurfaceId[] {
  return inventory.surfaces
    .filter((surface) => {
      if (!surface.detected) return false;
      const descriptor = getSurface(surface.id);
      if (descriptor.notApplicable.includes(kind)) return false;
      return descriptor.stores.some((store) => store.kind === kind);
    })
    .map((surface) => surface.id);
}

/** Resources the baseline declares, as `kind` + display name pairs. */
function baselineResources(baseline: HarnessConfig): Array<{ kind: HarnessResourceKind; name: string }> {
  const declared: Array<{ kind: HarnessResourceKind; name: string }> = [];
  for (const plugin of baseline.plugins ?? []) {
    if (typeof plugin.name === "string" && plugin.name.length > 0) {
      declared.push({ kind: "plugin", name: plugin.name });
    }
  }
  for (const skill of baseline.skills ?? []) {
    if (typeof skill.name === "string" && skill.name.length > 0) {
      // `enabled: false` in a baseline is a statement that the team does NOT
      // want it; recommending it would invert the baseline's meaning.
      if (skill.enabled === false) continue;
      declared.push({ kind: "skill", name: skill.name });
    }
  }
  for (const name of Object.keys(baseline["mcp-servers"] ?? {})) {
    if (name.length > 0) declared.push({ kind: "mcp-server", name });
  }
  return declared;
}

/**
 * A baseline plugin name may be bare (`research`) while the machine records
 * `research@harness-kit`. Match on the name half so a baseline does not have
 * to pin the marketplace to be satisfied.
 */
function pluginNameOf(identityKey: string): string {
  const withoutKind = identityKey.slice(identityKey.indexOf(":") + 1);
  const at = withoutKind.lastIndexOf("@");
  return at > 0 ? withoutKind.slice(0, at) : withoutKind;
}

export interface RecommendOptions {
  /** The team's parsed baseline profile, when one is configured. */
  baseline?: HarnessConfig | null;
}

/**
 * Compute recommendations. Ordering is deterministic — baseline gaps first
 * (a team standard outranks a local spread), then machine gaps, each sorted
 * by identityKey — because this feeds a UI list and a CLI report that must
 * not reshuffle between runs.
 */
export function recommend(
  inventory: MachineInventory,
  options: RecommendOptions = {},
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const rowsByKey = new Map(inventory.rows.map((row) => [row.key, row]));

  const baseline = options.baseline ?? null;
  if (baseline !== null) {
    // Everything the machine has, by kind, for the "anywhere" test.
    const present = new Set<string>();
    const presentPluginNames = new Set<string>();
    for (const row of inventory.rows) {
      const anywhere = Object.values(row.cells).some((cell) => cell.status === "present");
      if (!anywhere) continue;
      present.add(row.key);
      if (row.kind === "plugin") presentPluginNames.add(pluginNameOf(row.key).toLowerCase());
    }

    const seen = new Set<string>();
    for (const declared of baselineResources(baseline)) {
      const identityKey = `${declared.kind}:${declared.name.toLowerCase().trim()}`;
      if (seen.has(identityKey)) continue;
      seen.add(identityKey);
      const satisfied =
        present.has(identityKey) ||
        (declared.kind === "plugin" && presentPluginNames.has(declared.name.toLowerCase()));
      if (satisfied) continue;
      const candidates = candidateSurfaces(inventory, declared.kind);
      recommendations.push({
        source: "baseline-gap",
        kind: declared.kind,
        identityKey,
        name: declared.name,
        summary: `the baseline declares ${declared.kind} '${declared.name}' and this machine has it nowhere`,
        presentOn: [],
        missingOn: candidates,
      });
    }
  }

  for (const gap of inventory.gaps) {
    const row = rowsByKey.get(gap.row);
    if (row === undefined) continue;
    recommendations.push({
      source: "machine-gap",
      kind: row.kind,
      identityKey: row.key,
      name: row.name,
      summary: `${row.kind} '${row.name}' is on ${gap.presentOn.length} surface(s) but missing from ${gap.missingOn.length}`,
      presentOn: [...gap.presentOn],
      missingOn: [...gap.missingOn],
    });
  }

  const rank: Record<RecommendationSource, number> = { "baseline-gap": 0, "machine-gap": 1 };
  return recommendations.sort(
    (left, right) =>
      rank[left.source] - rank[right.source] ||
      left.identityKey.localeCompare(right.identityKey),
  );
}
