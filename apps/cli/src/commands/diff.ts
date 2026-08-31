import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import chalk from "chalk";
import {
  parseHarness,
  validateHarness,
  detectDrift,
  getCheckableTargets,
  isProtocolV2,
  buildMachineInventory,
  SURFACE_IDS,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import type {
  CellStatus,
  DriftItem,
  DriftClass,
  FieldDelta,
  GridRow,
  ObserveOptions,
  SurfaceId,
} from "@harness-kit/core";
import { buildReconciliationContext, legacyTargetHint, summarizePlan } from "./portability-common.js";

interface DiffFlags {
  target?: string;
  json?: boolean;
  from?: string;
  to?: string;
  only?: string;
}

const ALL_TARGETS = getCheckableTargets();

function parseTargets(targetStr: string): SurfaceId[] {
  if (targetStr === "all") return ALL_TARGETS;
  return targetStr.split(",").map((t) => {
    const trimmed = t.trim() as SurfaceId;
    if (!ALL_TARGETS.includes(trimmed)) {
      console.error(`Unknown target: ${trimmed}${legacyTargetHint(trimmed)}. Valid targets: ${ALL_TARGETS.join(", ")}, all`);
      process.exit(1);
    }
    return trimmed;
  });
}

function classLabel(cls: DriftClass): string {
  switch (cls) {
    case "missing":
      return chalk.red("missing");
    case "modified-inside-markers":
      return chalk.yellow("modified-inside-markers");
    case "user-modified-outside":
      return chalk.dim("user-modified-outside (never auto-fixed)");
    case "orphaned":
      return chalk.magenta("orphaned");
  }
}

/**
 * Minimal line-based unified-style diff — no external diff library. Good
 * enough for terminal review of instruction-block-sized text; not a general
 * LCS diff, just a line-by-line +/- comparison anchored at the first point
 * of divergence, which is legible for the marker-block content this command
 * displays.
 */
function renderLineDiff(before: string, after: string): string[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const lines: string[] = [];

  const max = Math.max(beforeLines.length, afterLines.length);
  let i = 0;
  while (i < max) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === a) {
      if (b !== undefined) lines.push(chalk.dim(`    ${b}`));
    } else {
      if (b !== undefined) lines.push(chalk.red(`  - ${b}`));
      if (a !== undefined) lines.push(chalk.green(`  + ${a}`));
    }
    i++;
  }
  return lines;
}

async function readDeployedContent(fs: NodeFsProvider, path: string): Promise<string | null> {
  try {
    return await fs.readFile(fs.joinPath(fs.cwd(), path));
  } catch {
    return null;
  }
}

// ── cross-surface mode (Task 13) ────────────────────────────────

/** Validate a cross-surface flag value against the full surface registry
 * (all 11 surfaces, not just compile targets). */
function parseSurfaceFlag(value: string | undefined, flag: string): SurfaceId {
  if (!value) {
    console.error(`Cross-surface diff requires both --from and --to (missing ${flag}).`);
    process.exit(1);
  }
  if (!(SURFACE_IDS as readonly string[]).includes(value)) {
    console.error(
      `Unknown surface: ${value}${legacyTargetHint(value)}. Valid surfaces: ${SURFACE_IDS.join(", ")}`,
    );
    process.exit(1);
  }
  return value as SurfaceId;
}

/** --only filter: bare kind matches row.kind; kind:name matches as an
 * identityKey prefix (identityKeys are `${kind}:${lowercased name}`). */
function rowMatchesOnly(row: GridRow, only: string | undefined): boolean {
  if (!only) return true;
  const normalized = only.toLowerCase().trim();
  if (normalized.includes(":")) return row.key.startsWith(normalized);
  return row.kind === normalized;
}

function statusPhrase(surface: SurfaceId, status: CellStatus): string {
  switch (status) {
    case "present":
      return `present on ${surface}`;
    case "absent":
      return `absent on ${surface}`;
    case "not-applicable":
      return `not applicable on ${surface}`;
    case "unknown":
      return `unknown on ${surface} (needs confirmation)`;
  }
}

interface PairRow {
  key: string;
  kind: string;
  name: string;
  from: CellStatus;
  to: CellStatus;
  /** Oriented FieldDeltas: `left` is always the --from side. Paths are
   * display-only (engine contract) and rendered verbatim. */
  deltas: FieldDelta[];
}

async function crossSurfaceDiff(flags: DiffFlags): Promise<void> {
  const from = parseSurfaceFlag(flags.from, "--from");
  const to = parseSurfaceFlag(flags.to, "--to");

  const fs = new NodeFsProvider();
  const platform = process.platform;
  const observeOpts: ObserveOptions = {
    projectRoot: fs.cwd(),
    homeRoot: homedir(),
    // Anything Node reports beyond darwin/win32 uses linux-style paths.
    platform: platform === "darwin" || platform === "win32" ? platform : "linux",
  };
  const inventory = await buildMachineInventory(fs, observeOpts);

  const pairRows: PairRow[] = [];
  for (const row of inventory.rows) {
    if (!rowMatchesOnly(row, flags.only)) continue;
    const fromStatus = row.cells[from].status;
    const toStatus = row.cells[to].status;
    // Rows absent from BOTH sides of the pair are noise here (they exist
    // because some third surface has the resource).
    if (fromStatus !== "present" && toStatus !== "present") continue;

    const deltas: FieldDelta[] = [];
    for (const diff of inventory.diffs) {
      if (diff.row !== row.key) continue;
      const [left, right] = diff.surfaces;
      if (left === from && right === to) {
        deltas.push(...diff.delta);
      } else if (left === to && right === from) {
        // Engine pairs are in registry order; orient them to --from/--to.
        deltas.push(
          ...diff.delta.map((delta) => ({
            path: delta.path,
            kind: delta.kind === "added" ? ("removed" as const) : delta.kind === "removed" ? ("added" as const) : ("changed" as const),
            ...("right" in delta ? { left: delta.right } : {}),
            ...("left" in delta ? { right: delta.left } : {}),
          })),
        );
      }
    }
    pairRows.push({ key: row.key, kind: row.kind, name: row.name, from: fromStatus, to: toStatus, deltas });
  }

  // Exit-1 triggers: a gap is one side present while the other is plain
  // "absent" (not-applicable and unknown cells never trigger); a diff is
  // any oriented FieldDelta between two present cells.
  const gapRows = pairRows.filter(
    (row) =>
      (row.from === "present" && row.to === "absent") ||
      (row.from === "absent" && row.to === "present"),
  );
  const diffRows = pairRows.filter((row) => row.deltas.length > 0);
  const identicalRows = pairRows.filter(
    (row) => row.from === "present" && row.to === "present" && row.deltas.length === 0,
  );

  if (flags.json) {
    console.log(
      JSON.stringify({
        from,
        to,
        rows: pairRows,
        summary: { gaps: gapRows.length, diffs: diffRows.length, identical: identicalRows.length },
      }),
    );
    if (gapRows.length > 0 || diffRows.length > 0) process.exit(1);
    return;
  }

  console.log(chalk.bold(`Cross-surface diff: ${from} → ${to}`));
  console.log("");

  if (pairRows.length === 0) {
    console.log(chalk.dim(`No resources observed on ${from} or ${to}${flags.only ? ` matching --only ${flags.only}` : ""}.`));
    return;
  }

  for (const row of pairRows) {
    console.log(chalk.bold(row.key));
    if (row.from === "present" && row.to === "present" && row.deltas.length === 0) {
      console.log(`  ${chalk.green("identical")} on ${from} and ${to}`);
    } else if (row.deltas.length > 0) {
      console.log(`  ${chalk.yellow("differs")} between ${from} and ${to}:`);
      for (const delta of row.deltas) {
        const left = delta.kind === "added" ? "—" : JSON.stringify(delta.left);
        const right = delta.kind === "removed" ? "—" : JSON.stringify(delta.right);
        console.log(chalk.dim(`    ${delta.path}: ${delta.kind}  ${from}=${left}  ${to}=${right}`));
      }
    } else {
      const missingSide = row.from === "present" ? to : from;
      const presentSide = row.from === "present" ? from : to;
      const missingStatus = row.from === "present" ? row.to : row.from;
      const phrase = statusPhrase(missingSide, missingStatus);
      const colored = missingStatus === "absent" ? chalk.red(phrase) : chalk.dim(phrase);
      console.log(`  present on ${presentSide}, ${colored}`);
    }
    console.log("");
  }

  console.log(
    chalk.dim(
      `${gapRows.length} gap(s), ${diffRows.length} diff(s), ${identicalRows.length} identical row(s) between ${from} and ${to}.`,
    ),
  );

  if (gapRows.length > 0 || diffRows.length > 0) {
    process.exit(1);
  }
}

export async function diffCommand(
  filePath: string | undefined,
  flags: DiffFlags,
): Promise<void> {
  // Cross-surface mode (Task 13): compares two surfaces' observed native
  // state directly — no harness.yaml involved. The classic drift mode
  // below is untouched (AC-29).
  if (flags.from !== undefined || flags.to !== undefined) {
    await crossSurfaceDiff(flags);
    return;
  }

  const resolved = resolve(filePath ?? "harness.yaml");
  const fs = new NodeFsProvider();

  let yamlString: string;
  try {
    yamlString = await readFile(resolved, "utf-8");
  } catch {
    console.error(`No harness.yaml found at ${resolved}.`);
    process.exit(1);
  }

  let config;
  try {
    ({ config } = parseHarness(yamlString));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }

  const validation = validateHarness(config);
  if (!validation.valid) {
    console.error("harness.yaml is invalid — run harness validate for details.");
    process.exit(1);
  }

  const targets = flags.target ? parseTargets(flags.target) : ALL_TARGETS;
  const adapterCtx = { fs, projectRoot: fs.cwd(), homeRoot: await fs.homedir() };
  const report = await detectDrift(config, adapterCtx, targets);
  const reconciliation = isProtocolV2(config.version)
    ? summarizePlan(await buildReconciliationContext(resolved, { target: targets.join(",") }).then((context) => context.plan))
    : undefined;

  if (flags.json) {
    console.log(JSON.stringify({ ...report, ...(reconciliation ? { reconciliation } : {}) }));
    if (report.hasDrift || (reconciliation as { blocked?: boolean } | undefined)?.blocked) process.exit(1);
    return;
  }

  if (report.items.length === 0) {
    console.log(chalk.green("No drift detected.") + " Deployed config matches harness.yaml.");
    if ((reconciliation as { blocked?: boolean } | undefined)?.blocked) {
      console.log(chalk.yellow("Portable/native reconciliation still has unresolved conflicts; run harness-kit reconcile."));
      process.exit(1);
    }
    return;
  }

  // Group by file path for readable per-file diffs.
  const byPath = new Map<string, DriftItem[]>();
  for (const item of report.items) {
    const list = byPath.get(item.path) ?? [];
    list.push(item);
    byPath.set(item.path, list);
  }

  for (const [path, items] of byPath) {
    console.log(chalk.bold(path));
    const deployed = await readDeployedContent(fs, path);

    for (const item of items) {
      console.log(`  ${classLabel(item.class)}  ${chalk.dim(`slot: ${item.slot}, target: ${item.target}`)}`);
      console.log(chalk.dim(`    ${item.detail}`));

      if (item.expectedContent !== undefined) {
        const before = deployed ?? "";
        console.log("");
        for (const line of renderLineDiff(before, item.expectedContent)) {
          console.log(line);
        }
      }
      console.log("");
    }
  }

  console.log(
    chalk.dim(
      `${report.items.length} drift item(s) across ${byPath.size} file(s). Run "harness fix" to preview repairs.`,
    ),
  );

  if (report.hasDrift) {
    process.exit(1);
  }
}
