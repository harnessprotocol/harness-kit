import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import {
  parseHarness,
  validateHarness,
  detectDrift,
  getCheckableTargets,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import type { DriftItem, DriftClass, TargetPlatform } from "@harness-kit/core";

interface DiffFlags {
  target?: string;
  json?: boolean;
}

const ALL_TARGETS = getCheckableTargets();

function parseTargets(targetStr: string): TargetPlatform[] {
  if (targetStr === "all") return ALL_TARGETS;
  return targetStr.split(",").map((t) => {
    const trimmed = t.trim() as TargetPlatform;
    if (!ALL_TARGETS.includes(trimmed)) {
      console.error(`Unknown target: ${trimmed}. Valid targets: ${ALL_TARGETS.join(", ")}, all`);
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

export async function diffCommand(
  filePath: string | undefined,
  flags: DiffFlags,
): Promise<void> {
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

  if (flags.json) {
    console.log(JSON.stringify(report));
    if (report.hasDrift) process.exit(1);
    return;
  }

  if (report.items.length === 0) {
    console.log(chalk.green("No drift detected.") + " Deployed config matches harness.yaml.");
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
