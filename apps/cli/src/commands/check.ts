import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import {
  parseHarness,
  validateHarness,
  checkCompiled,
  getCheckableTargets,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import type { CheckEntry, CheckResult, TargetPlatform } from "@harness-kit/core";

interface CheckFlags {
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

function statusColor(status: CheckEntry["status"]): string {
  switch (status) {
    case "ok":
      return chalk.green("ok");
    case "drift":
      return chalk.yellow("drift") + chalk.dim("  (recompile needed)");
    case "missing":
      return chalk.red("missing");
  }
}

function formatCheckResult(result: CheckResult): string {
  const lines: string[] = [];

  const instructions = result.entries.filter((e) => e.kind === "instruction");
  const skills = result.entries.filter((e) => e.kind === "skill");

  if (instructions.length > 0) {
    lines.push(chalk.bold("instructions:"));
    for (const e of instructions) {
      const name = e.name.padEnd(14);
      const target = e.target.padEnd(14);
      lines.push(`  ${name}${target}${statusColor(e.status)}`);
    }
  }

  if (skills.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(chalk.bold("skills:"));
    for (const e of skills) {
      const name = e.name.padEnd(14);
      const target = e.target.padEnd(14);
      lines.push(`  ${name}${target}${statusColor(e.status)}`);
    }
  }

  if (result.entries.length === 0) {
    lines.push(chalk.dim("Nothing to check — no skills or instructions configured."));
  }

  return lines.join("\n");
}

export async function checkCommand(
  filePath: string | undefined,
  flags: CheckFlags,
): Promise<void> {
  const resolved = resolve(filePath ?? "harness.yaml");
  const fs = new NodeFsProvider();

  let yamlString: string;
  try {
    yamlString = await readFile(resolved, "utf-8");
  } catch {
    if (flags.json) {
      console.log(JSON.stringify({ drifted: false, changes: [], error: `No harness.yaml found at ${resolved}.` }));
    } else {
      console.error(`No harness.yaml found at ${resolved}.`);
    }
    process.exit(1);
  }

  let config;
  try {
    ({ config } = parseHarness(yamlString));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (flags.json) {
      console.log(JSON.stringify({ drifted: false, changes: [], error: msg }));
    } else {
      console.error(msg);
    }
    process.exit(1);
  }

  const validation = validateHarness(config);
  if (!validation.valid) {
    const msg = `harness.yaml is invalid — run harness validate for details.`;
    if (flags.json) {
      console.log(JSON.stringify({ drifted: false, changes: [], error: msg }));
    } else {
      console.error(msg);
    }
    process.exit(1);
  }

  const targets = flags.target ? parseTargets(flags.target) : ALL_TARGETS;
  const result = await checkCompiled(config, targets, fs);

  if (flags.json) {
    console.log(JSON.stringify({
      drifted: result.hasDrift,
      changes: result.entries.map((e) => ({
        kind: e.kind,
        name: e.name,
        target: e.target,
        status: e.status,
      })),
    }));
  } else {
    console.log(formatCheckResult(result));
  }

  if (result.hasDrift) {
    process.exit(1);
  }
}
