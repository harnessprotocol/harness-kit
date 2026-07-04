import type { FsProvider } from "../fs-provider.js";
import type { HarnessConfig, TargetPlatform } from "../types.js";
import { parseHarness } from "../parser/parse-harness.js";
import { validateHarness } from "../schema/validate.js";
import { getAllAdapters, groupTargetsByAdapter } from "../adapters/registry.js";
import { getCheckableTargets } from "../compile/check.js";
import { detectDrift } from "../fix/index.js";
import type { AdapterContext } from "../adapters/adapter.js";
import type { AdapterId } from "../adapters/adapter.js";
import type { FleetCell, FleetReport, FleetRow, FleetScope, FleetStatus } from "./types.js";

export type { FleetScopeKind, FleetScope, FleetStatus, FleetCell, FleetRow, FleetSummaryCounts, FleetReport } from "./types.js";

// ── Input scope descriptor ─────────────────────────────────────────
//
// The caller (CLI today; desktop later) supplies the concrete list of
// scopes to scan — this module has no opinion on how "tracked projects"
// are discovered/persisted (no such registry exists yet). A scope is just
// "an FsProvider rooted here, with this display label/kind".

export interface FleetScopeInput {
  kind: FleetScope["kind"];
  label: string;
  fs: FsProvider;
}

export interface BuildFleetReportContext {
  scopes: FleetScopeInput[];
  /** Restrict detection/drift to these legacy targets. Defaults to all checkable targets. */
  targets?: TargetPlatform[];
}

/**
 * Read harness.yaml at the root of `fs`, if present. Returns null (not an
 * error) when the file is missing, unparsable, or fails schema validation —
 * all three are "no usable harness.yaml for this scope" from the fleet
 * report's point of view; the caller doesn't need to distinguish them here
 * (a per-scope `not-configured` status covers all three).
 */
async function readScopeConfig(fs: FsProvider): Promise<HarnessConfig | null> {
  const path = fs.joinPath(fs.cwd(), "harness.yaml");
  let yamlString: string;
  try {
    yamlString = await fs.readFile(path);
  } catch {
    return null;
  }

  try {
    const { config } = parseHarness(yamlString);
    const validation = validateHarness(config);
    if (!validation.valid) return null;
    return config;
  } catch {
    return null;
  }
}

/**
 * Composes existing detect() + detectDrift() across every registered
 * adapter, for every supplied scope, into one FleetReport. No new detection
 * or drift-classification logic lives here — this is pure aggregation.
 */
export async function buildFleetReport(ctx: BuildFleetReportContext): Promise<FleetReport> {
  const targets = ctx.targets ?? getCheckableTargets();
  const scopes: FleetScope[] = ctx.scopes.map((s) => ({
    kind: s.kind,
    root: s.fs.cwd(),
    label: s.label,
  }));

  const rows: FleetRow[] = [];
  const summary = { inSync: 0, drift: 0, notConfigured: 0, notInstalled: 0 };

  for (const adapter of getAllAdapters()) {
    const row: FleetRow = { adapter: adapter.id, cells: {} };

    for (const scopeInput of ctx.scopes) {
      const scope = scopes.find((s) => s.root === scopeInput.fs.cwd())!;
      const cell = await buildCell(adapter.id, scopeInput, targets);
      row.cells[scope.root] = cell;

      switch (cell.status) {
        case "in-sync":
          summary.inSync++;
          break;
        case "drift":
          summary.drift++;
          break;
        case "not-configured":
          summary.notConfigured++;
          break;
        case "not-installed":
          summary.notInstalled++;
          break;
      }
    }

    rows.push(row);
  }

  return { scopes, rows, summary };
}

async function buildCell(
  adapterId: AdapterId,
  scopeInput: FleetScopeInput,
  requestedTargets: TargetPlatform[],
): Promise<FleetCell> {
  const { fs } = scopeInput;
  const homeRoot = await fs.homedir();
  const adapterCtx: AdapterContext = { fs, projectRoot: fs.cwd(), homeRoot };

  // Restrict to the subset of requested targets this adapter actually covers.
  const groups = groupTargetsByAdapter(requestedTargets).filter(
    (g) => g.adapter.id === adapterId,
  );
  const targets = groups.flatMap((g) => g.legacyTargets);

  const detectResult = await getAdapterDetect(adapterId, adapterCtx);
  const detected = detectResult !== null;

  if (!detected) {
    return {
      adapter: adapterId,
      targets,
      status: "not-installed",
      driftCount: 0,
      detail: "no indicators found for this tool in this scope",
    };
  }

  const config = await readScopeConfig(fs);
  if (!config) {
    return {
      adapter: adapterId,
      targets,
      status: "not-configured",
      driftCount: 0,
      detail: "tool detected but no valid harness.yaml found for this scope",
    };
  }

  const driftReport = await detectDrift(config, adapterCtx, targets);
  const status: FleetStatus = driftReport.hasDrift ? "drift" : "in-sync";

  return {
    adapter: adapterId,
    targets,
    status,
    driftCount: driftReport.items.length,
    detail: driftReport.hasDrift
      ? `${driftReport.items.length} drifted item(s)`
      : "deployed config matches harness.yaml",
  };
}

async function getAdapterDetect(adapterId: AdapterId, ctx: AdapterContext) {
  const adapter = getAllAdapters().find((a) => a.id === adapterId)!;
  return adapter.detect(ctx);
}
