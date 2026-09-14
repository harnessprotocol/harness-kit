import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, basename } from "node:path";
import chalk from "chalk";
import {
  buildFleetReport,
  computeMachineInventory,
  getSurface,
  normalizeObservation,
  observeAllSurfaces,
  parseHarness,
  PRODUCT_FAMILIES,
  recommend,
} from "@harness-kit/core";
import type {
  FleetReport,
  HarnessConfig,
  Recommendation,
  FleetScopeInput,
  FleetStatus,
  MachineInventory,
  ObserveOptions,
  SurfaceId,
  SurfaceObservation,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import { defaultStatePath, SqliteStateStore } from "../state/sqlite-store.js";
import { resolveDefinitions } from "../definitions/resolve-definitions.js";
import { buildReconciliationContext, currentPlatform, summarizePlan } from "./portability-common.js";

interface StatusFlags {
  json?: boolean;
  global?: boolean;
  /** Path to the team's baseline harness.yaml, for AC-10 recommendations. */
  baseline?: string;
}

function statusColor(status: FleetStatus): string {
  switch (status) {
    case "in-sync":
      return chalk.green("in-sync");
    case "drift":
      return chalk.yellow("drift");
    case "not-configured":
      return chalk.dim("not-configured");
    case "not-installed":
      return chalk.dim("not-installed");
  }
}

function cellText(report: FleetReport, adapter: string, scopeRoot: string): string {
  const row = report.rows.find((r) => r.adapter === adapter);
  const cell = row?.cells[scopeRoot];
  if (!cell) return chalk.dim("—");
  if (cell.status === "drift") {
    return `${statusColor(cell.status)} ${chalk.dim(`(${cell.driftCount})`)}`;
  }
  return statusColor(cell.status);
}

function formatTable(report: FleetReport): string {
  const lines: string[] = [];

  const adapterCol = 16;
  const scopeCol = 22;

  const header = ["harness".padEnd(adapterCol), ...report.scopes.map((s) => s.label.padEnd(scopeCol))];
  lines.push(chalk.bold(header.join("")));

  for (const row of report.rows) {
    const cells = report.scopes.map((s) => cellText(report, row.adapter, s.root));
    // padEnd on colored strings pads by visible length incorrectly, so pad
    // the plain label/column widths using raw text lengths computed before
    // chalk wraps them where possible; scopeCol is generous enough in
    // practice for the four current adapter ids + status words.
    const line = [row.adapter.padEnd(adapterCol), ...cells.map((c) => c.padEnd(scopeCol))];
    lines.push(line.join(""));
  }

  lines.push("");
  lines.push(
    chalk.dim(
      `${report.summary.inSync} in-sync, ${report.summary.drift} drift, ` +
        `${report.summary.notConfigured} not-configured, ${report.summary.notInstalled} not-installed`,
    ),
  );

  return lines.join("\n");
}

/**
 * Machine section (Task 13): all 11 surfaces grouped by product family.
 * Per-surface present-row counts are derived from row CELLS — never from
 * surfaces[].resourceCount, which counts raw entries (scope duplicates and
 * store collisions included).
 */
function formatMachineSection(machine: MachineInventory): string {
  const lines: string[] = [];
  lines.push(chalk.bold("Machine"));

  const presentRows = (id: SurfaceId): number =>
    machine.rows.filter((row) => row.cells[id]?.status === "present").length;
  const gapsInvolving = (id: SurfaceId): number =>
    machine.gaps.filter((gap) => gap.presentOn.includes(id) || gap.missingOn.includes(id)).length;

  for (const family of PRODUCT_FAMILIES) {
    const familySurfaces = machine.surfaces.filter((s) => getSurface(s.id).family === family);
    if (familySurfaces.length === 0) continue;
    for (const surface of familySurfaces) {
      const label = getSurface(surface.id).label.padEnd(28);
      const counts = `${presentRows(surface.id)} present, ${gapsInvolving(surface.id)} gap(s)`;
      if (surface.detected) {
        lines.push(`  ${chalk.green("✓")} ${label}${counts}`);
      } else {
        lines.push(chalk.dim(`  ✗ ${label}${counts} (not installed)`));
      }
      // Registered plugin marketplaces (AC-4). Printed only where the
      // surface actually registers some — an unreadable surface stays quiet
      // here rather than claiming it has none.
      if (surface.detected && surface.marketplaces.length > 0) {
        const ids = [...new Set(surface.marketplaces.map((m) => m.id))].join(", ");
        lines.push(chalk.dim(`      marketplaces: ${ids}`));
      }
    }
  }

  lines.push("");
  lines.push(
    chalk.dim(
      `${machine.rows.length} resource row(s), ${machine.gaps.length} gap(s), ` +
        `${machine.diffs.length} diff(s) across surfaces`,
    ),
  );
  lines.push(chalk.dim("Compare two surfaces: harness-kit diff --from <a> --to <b>"));
  return lines.join("\n");
}

/**
 * Recommendations section (AC-10). Printed only when there is something to
 * say — an empty "Recommendations" header trains people to ignore the
 * section that matters.
 */
function formatRecommendations(recommendations: Recommendation[]): string {
  if (recommendations.length === 0) return "";
  const lines: string[] = ["", chalk.bold("Recommendations")];
  for (const item of recommendations) {
    const tag = item.source === "baseline-gap" ? chalk.yellow("baseline") : chalk.dim("machine ");
    lines.push(`  ${tag}  ${item.kind}:${item.name}`);
    lines.push(chalk.dim(`             ${item.summary}`));
    if (item.missingOn.length > 0) {
      lines.push(
        chalk.dim(`             add to: ${item.missingOn.join(", ")}`),
      );
    }
  }
  return lines.join("\n");
}

/**
 * Load and parse a baseline profile from disk.
 *
 * Local paths only this milestone. AC-10 describes a GIT-hosted harness.yaml,
 * and fetching one needs the signed-definitions transport that lands in M4 —
 * so a `--baseline` pointing at a URL is refused with that reason rather than
 * silently doing nothing.
 */
async function loadBaseline(path: string): Promise<HarnessConfig | null> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.startsWith("github:")) {
    console.error(
      chalk.yellow(
        `--baseline currently reads a local file; fetching '${path}' needs the signed definitions transport (M4).`,
      ),
    );
    return null;
  }
  let text: string;
  try {
    text = await readFile(resolve(path), "utf8");
  } catch (error) {
    console.error(
      chalk.yellow(
        `--baseline: could not read ${path} (${error instanceof Error ? error.message : String(error)})`,
      ),
    );
    return null;
  }
  // parseHarness throws on an unparseable document rather than returning a
  // result flag; a bad baseline must not take the whole status report down.
  try {
    return parseHarness(text).config;
  } catch (error) {
    console.error(
      chalk.yellow(
        `--baseline: ${path} is not a valid harness profile (${error instanceof Error ? error.message : String(error)})`,
      ),
    );
    return null;
  }
}

/**
 * Record the observation snapshot into the shared state db. Graceful
 * degrade by contract: any store failure (locked db, corrupt file,
 * unwritable path) returns a short reason instead of throwing — history is
 * a convenience, never a reason for `status` to fail.
 */
async function recordSnapshot(
  observations: SurfaceObservation[],
  opts: ObserveOptions,
): Promise<string | null> {
  let store: SqliteStateStore | undefined;
  try {
    store = await SqliteStateStore.open(defaultStatePath());
    await store.recordObservation(
      {
        observedAt: new Date().toISOString(),
        platform: opts.platform,
        projectRoot: opts.projectRoot,
        homeRoot: opts.homeRoot,
      },
      observations.flatMap((observation) => normalizeObservation(observation)),
    );
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.split("\n")[0];
  } finally {
    try {
      await store?.close();
    } catch {
      // The handle is already unusable; nothing left to release.
    }
  }
}

export async function statusCommand(flags: StatusFlags): Promise<void> {
  const cwd = resolve(".");
  const projectFs = new NodeFsProvider(cwd);
  const projectLabel = basename(cwd);
  const scopes: FleetScopeInput[] = [{ kind: "project", label: projectLabel, fs: projectFs }];
  if (flags.global) {
    const home = await projectFs.homedir();
    scopes.push({
      kind: "global" as const,
      label: "personal",
      fs: new NodeFsProvider(home),
      profilePath: ".harness/harness.yaml",
    });
  }

  const report = await buildFleetReport({
    scopes,
  });
  let reconciliation: Record<string, unknown> | undefined;
  if (await projectFs.exists(projectFs.joinPath(cwd, "harness.yaml"))) {
    try {
      reconciliation = summarizePlan((await buildReconciliationContext("harness.yaml", {})).plan);
    } catch {
      // Fleet status remains available for legacy or partially configured profiles.
    }
  }

  // Machine inventory (Task 13, additive): observe every surface once,
  // fold into the grid, and reuse the same observations for both the
  // rendered/JSON inventory and the persisted history snapshot. Status
  // always runs with project context (--global only ADDS the personal
  // fleet scope), so projectRoot is always the resolved cwd.
  const observeOpts: ObserveOptions = {
    projectRoot: cwd,
    homeRoot: homedir(),
    platform: currentPlatform(),
  };
  // AC-26: `status` is the FOURTH inventory entry point, and the last to be
  // wired. While it was not, it read the compiled-in registry while `diff`
  // and `sync` read a bundle's, so the three commands disagreed about the
  // same machine — `status` called a resource absent that `diff` called
  // present, in the same directory.
  let definitionsStore: SqliteStateStore | undefined;
  try {
    definitionsStore = await SqliteStateStore.open(defaultStatePath());
  } catch {
    definitionsStore = undefined;
  }
  let surfaces;
  try {
    surfaces = (await resolveDefinitions(definitionsStore)).surfaces;
  } finally {
    await definitionsStore?.close();
  }
  const observations = await observeAllSurfaces(projectFs, observeOpts, [...surfaces]);
  const machine = computeMachineInventory(observations, surfaces);
  const stateError = await recordSnapshot(observations, observeOpts);
  if (stateError) {
    console.error(
      chalk.yellow(`state database unavailable: ${stateError} — continuing without history`),
    );
  }

  if (flags.json) {
    console.log(
      JSON.stringify({
        ...report,
        ...(reconciliation ? { reconciliation } : {}),
        machine,
        recommendations: recommend(
          machine,
          { baseline: flags.baseline === undefined ? null : await loadBaseline(flags.baseline) },
          surfaces,
        ),
      }),
    );
    return;
  }

  console.log(chalk.bold(`Fleet status for ${cwd}`));
  console.log("");
  console.log(formatTable(report));
  console.log("");
  console.log(formatMachineSection(machine));
  const baseline = flags.baseline === undefined ? null : await loadBaseline(flags.baseline);
  const recommendations = recommend(machine, { baseline }, surfaces);
  const section = formatRecommendations(recommendations);
  if (section.length > 0) console.log(section);
  if ((reconciliation as { blocked?: boolean } | undefined)?.blocked) {
    console.log("");
    console.log(chalk.yellow("Whole-harness reconciliation has unresolved conflicts."));
  }

  if (report.summary.drift > 0 || (reconciliation as { blocked?: boolean } | undefined)?.blocked) {
    process.exit(1);
  }
}
