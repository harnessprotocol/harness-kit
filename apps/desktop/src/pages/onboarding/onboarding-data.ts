import type {
  AdapterFindingsSummary,
  AdapterId,
  ImportConflict,
  ImportProjectResult,
} from "@harness-kit/core";
import { ADAPTER_META } from "../fleet/adapter-meta";

/**
 * Derived view model for the onboarding sprawl-reveal (DESIGN.md §6.3). Every
 * field here is computed from a real `importProject()`/`importMachine()`
 * result — nothing is fabricated. When the machine has zero or one harness,
 * these numbers are honestly small (see `isLowHarnessCount`) rather than
 * padded to look dramatic.
 */

export interface SourceHarnessChip {
  adapter: AdapterId;
  name: string;
  monogram: string;
  /** Distinct config files this adapter contributed. */
  fileCount: number;
  /** Fields this adapter's values were overridden/conflicted on. */
  conflictCount: number;
}

export interface ConflictRow {
  field: string;
  /** Human-readable summary, e.g. "'run tests before commit' appears in 3 tools with 2 wordings". */
  description: string;
  adapters: AdapterId[];
}

export interface SprawlStats {
  /** Adapters that were actually detected on this machine/project. */
  harnessesFound: number;
  /** Distinct source files read across all detected adapters. */
  configFiles: number;
  /** Instruction slots that received text from more than one adapter. */
  overlappingInstructionSets: number;
  /** Genuine value conflicts recorded by the synthesizer (mcp-servers/permissions). */
  directConflicts: number;
}

export interface ConvergenceData {
  sources: SourceHarnessChip[];
  /** Counts shown on the destination harness.yaml card. */
  destination: {
    mcpServerCount: number;
    pluginCount: number;
    skillCount: number;
  };
}

export interface SprawlReveal {
  stats: SprawlStats;
  convergence: ConvergenceData;
  conflicts: ConflictRow[];
  /** True when there's at most one detected harness — reveal still teaches, just doesn't claim "sprawl". */
  isLowHarnessCount: boolean;
}

function fileCountForAdapter(summary: AdapterFindingsSummary): number {
  const files = new Set<string>();
  for (const f of summary.found) files.add(f.file);
  return files.size;
}

function conflictCountForAdapter(adapter: AdapterId, conflicts: ImportConflict[]): number {
  let count = 0;
  for (const conflict of conflicts) {
    if (conflict.alternates.some((alt) => alt.adapter === adapter)) count++;
  }
  return count;
}

function conflictAdapters(conflict: ImportConflict): AdapterId[] {
  return [...new Set(conflict.alternates.map((a) => a.adapter))];
}

/** Best-effort human phrasing for a single recorded conflict. Never invents specifics beyond what's in the data. */
function describeConflict(conflict: ImportConflict): string {
  const adapters = conflictAdapters(conflict);
  const adapterNames = adapters.map((a) => ADAPTER_META[a]?.name ?? a);

  if (conflict.field.startsWith("mcp-servers.")) {
    const serverName = conflict.field.slice("mcp-servers.".length);
    return `MCP server '${serverName}' is configured differently in ${adapterNames.join(" and ")}`;
  }
  if (conflict.field === "permissions.tools") {
    return `A tool is allowed in one harness and denied in another (${adapterNames.join(", ")})`;
  }
  return `'${conflict.field}' disagrees across ${adapterNames.join(", ")}`;
}

export function buildSprawlReveal(result: ImportProjectResult): SprawlReveal {
  const detected = result.findings.adapters.filter((a) => a.detected);
  const conflicts = result.provenance.conflicts;

  const configFiles = new Set<string>();
  for (const summary of detected) {
    for (const f of summary.found) configFiles.add(f.file);
  }

  // "Overlapping instruction sets" = instruction slots (operational/behavioral/identity)
  // that received a block from more than one distinct adapter — the concrete,
  // countable signal behind "several tools tell the harness the same thing,
  // worded differently".
  const slotAdapters = new Map<string, Set<AdapterId>>();
  for (const summary of detected) {
    for (const f of summary.found) {
      if (f.domain !== "instructions") continue;
      // detail looks like "<slot> instruction block (<n> chars)"
      const slot = f.detail.split(" ")[0];
      if (!slotAdapters.has(slot)) slotAdapters.set(slot, new Set());
      slotAdapters.get(slot)!.add(summary.adapter);
    }
  }
  const overlappingInstructionSets = [...slotAdapters.values()].filter((set) => set.size > 1).length;

  const sources: SourceHarnessChip[] = detected.map((summary) => ({
    adapter: summary.adapter,
    name: ADAPTER_META[summary.adapter]?.name ?? summary.adapter,
    monogram: ADAPTER_META[summary.adapter]?.monogram ?? summary.adapter.slice(0, 2).toUpperCase(),
    fileCount: fileCountForAdapter(summary),
    conflictCount: conflictCountForAdapter(summary.adapter, conflicts),
  }));

  const conflictRows: ConflictRow[] = conflicts.map((c) => ({
    field: c.field,
    description: describeConflict(c),
    adapters: conflictAdapters(c),
  }));

  const mcpServerCount = Object.keys(result.harnessConfig["mcp-servers"] ?? {}).length;
  const pluginCount = (result.harnessConfig.plugins ?? []).length;
  const skillCount = 0; // synthesize() never populates skills today (see ImportedSkills doc comment) — honest zero, not fabricated.

  return {
    stats: {
      harnessesFound: detected.length,
      configFiles: configFiles.size,
      overlappingInstructionSets,
      directConflicts: conflicts.length,
    },
    convergence: {
      sources,
      destination: { mcpServerCount, pluginCount, skillCount },
    },
    conflicts: conflictRows,
    isLowHarnessCount: detected.length <= 1,
  };
}
