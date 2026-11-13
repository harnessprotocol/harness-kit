import { baselineCoverage, parseHarness } from "@harness-kit/core";
import type {
  BaselineCoverageEntry,
  GridRow,
  HarnessConfig,
  MachineInventory,
  SurfaceDescriptor,
} from "@harness-kit/core";
import { errorDetails } from "../../lib/error-details";
import { readHarnessSource } from "../../lib/harness-source";
import { KIND_LABELS } from "./machine-view-model";

/**
 * The Machine grid's Team baseline column (spec AC-26, Q4): the selected
 * project's committed harness.yaml, read from the local checkout, joined to
 * the scan by core's `baselineCoverage`. Pure apart from `readTeamBaseline`.
 */

/** What reading the project's harness.yaml gave. */
export type TeamBaselineState =
  /** No project chosen, or the project has no harness.yaml: no column, no notice. */
  | { status: "none" }
  /** The file exists but could not be read or parsed: no column, a short notice. */
  | { status: "unavailable"; message: string }
  | { status: "ready"; config: HarnessConfig };

export const NO_TEAM_BASELINE: TeamBaselineState = { status: "none" };

/** Never throws: a failure becomes `unavailable` so the page shows a notice, not a crash. */
export async function readTeamBaseline(projectDir: string | null): Promise<TeamBaselineState> {
  if (!projectDir) return NO_TEAM_BASELINE;
  try {
    const source = await readHarnessSource(projectDir);
    if (!source.found || source.content === null) return NO_TEAM_BASELINE;
    return { status: "ready", config: parseHarness(source.content).config };
  } catch (err) {
    return { status: "unavailable", message: errorDetails(err) };
  }
}

/** A cell of the Team baseline column. Rows the baseline does not declare have none. */
export type BaselineCellState = "required" | "missing-here";

export interface TeamBaselineView {
  /** Column cell by row key; a row not in the map shows an empty cell. */
  cells: Map<string, BaselineCellState>;
  /** Rows to add for baseline entries the machine has nowhere (every cell absent). */
  syntheticRows: GridRow[];
  entries: BaselineCoverageEntry[];
}

/** Pass the same registry the inventory was built with. */
export function buildTeamBaselineView(
  inventory: MachineInventory,
  config: HarnessConfig,
  registry?: readonly SurfaceDescriptor[],
): TeamBaselineView {
  const entries = baselineCoverage(inventory, config, registry);
  const cells = new Map<string, BaselineCellState>();
  const syntheticRows: GridRow[] = [];
  for (const entry of entries) {
    if (entry.status === "present") {
      for (const key of entry.rowKeys) cells.set(key, "required");
      continue;
    }
    cells.set(entry.identityKey, "missing-here");
    syntheticRows.push({
      key: entry.identityKey,
      kind: entry.kind,
      name: entry.name,
      cells: Object.fromEntries(
        inventory.surfaces.map((surface) => [surface.id, { status: "absent", entries: [] }]),
      ) as unknown as GridRow["cells"],
    });
  }
  return { cells, syntheticRows, entries };
}

/**
 * `rows` with the synthetic rows added, each after the last row of its kind so
 * the grid's kind sections stay contiguous; a kind the machine has no row for
 * gets a section after the existing ones, in `KIND_LABELS` order.
 */
export function withSyntheticRows(rows: GridRow[], synthetic: GridRow[]): GridRow[] {
  if (synthetic.length === 0) return rows;
  const result = [...rows];
  const kindOrder = Object.keys(KIND_LABELS);
  const rank = (kind: string) => {
    const index = kindOrder.indexOf(kind);
    return index === -1 ? kindOrder.length : index;
  };
  for (const row of [...synthetic].sort((a, b) => rank(a.kind) - rank(b.kind))) {
    let at = -1;
    for (let index = result.length - 1; index >= 0; index--) {
      if (result[index].kind === row.kind) {
        at = index;
        break;
      }
    }
    if (at === -1) result.push(row);
    else result.splice(at + 1, 0, row);
  }
  return result;
}

/**
 * The CLI way to close a baseline entry the machine lacks. compile writes
 * relative to the current directory and skips plugins that are not installed,
 * so the command goes to the project root and installs first.
 */
export function baselineCompileCommand(projectDir: string): string {
  const root = projectDir.replace(/\/+$/, "") || "/";
  const quoted = /^[\w@%+=:,./-]+$/.test(root) ? root : `'${root.replace(/'/g, `'\\''`)}'`;
  const cli = "npx -p @harnessprotocol/cli harness-kit";
  return `cd ${quoted} && ${cli} install harness.yaml && ${cli} compile harness.yaml`;
}
