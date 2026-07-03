import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import {
  parseHarness,
  validateHarness,
  detectDrift,
  buildFixPlan,
  applyFix,
  getCheckableTargets,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import type { FixOperation, TargetPlatform } from "@harness-kit/core";

interface FixFlags {
  target?: string;
  apply?: boolean;
  json?: boolean;
  yes?: boolean;
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

function operationLabel(op: FixOperation): string {
  switch (op) {
    case "restore-marker":
      return chalk.yellow("restore-marker");
    case "remove-orphan":
      return chalk.magenta("remove-orphan");
    case "create-file":
      return chalk.green("create-file");
  }
}

/** `.harness/backups/<timestamp>/` — caller-supplied, core never calls Date.now(). */
function backupTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function fixCommand(
  filePath: string | undefined,
  flags: FixFlags,
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

  const driftReport = await detectDrift(config, adapterCtx, targets);
  const plan = await buildFixPlan(driftReport.items, fs);

  if (flags.json) {
    console.log(JSON.stringify({ plan, applied: false }));
  }

  if (plan.changes.length === 0 && plan.acknowledged.length === 0) {
    if (!flags.json) {
      console.log(chalk.green("Nothing to fix.") + " Deployed config matches harness.yaml.");
    }
    return;
  }

  if (!flags.json) {
    console.log(chalk.bold(flags.apply ? "Fix plan (will be applied):" : "Fix plan (dry run — pass --apply to execute):"));
    console.log("");

    for (const change of plan.changes) {
      console.log(`  ${operationLabel(change.operation)}  ${chalk.bold(change.path)}`);
      for (const repair of change.repairs) {
        console.log(chalk.dim(`      ${repair.detail}`));
      }
    }

    if (plan.acknowledged.length > 0) {
      console.log("");
      console.log(chalk.dim(`${plan.acknowledged.length} item(s) require manual review (user-modified-outside — never auto-fixed):`));
      for (const item of plan.acknowledged) {
        console.log(chalk.dim(`      ${item.path}: ${item.detail}`));
      }
    }
    console.log("");
  }

  // Dry-run is the DEFAULT — only proceed to apply when --apply is passed.
  if (!flags.apply) {
    if (!flags.json) {
      console.log(chalk.dim(`${plan.changes.length} file(s) would change. Re-run with --apply to write these changes.`));
    }
    return;
  }

  if (plan.changes.length === 0) {
    if (!flags.json) {
      console.log(chalk.dim("No repairable drift — nothing to apply."));
    }
    return;
  }

  if (!flags.yes && !flags.json) {
    const proceed = await confirm({
      message: `Apply ${plan.changes.length} change(s)? A backup will be written first.`,
      default: false,
    });
    if (!proceed) {
      console.log(chalk.dim("Aborted."));
      return;
    }
  }

  const timestamp = backupTimestamp();
  const result = await applyFix(plan, { fs, timestamp });

  if (flags.json) {
    console.log(JSON.stringify({ plan, applied: true, result }));
    return;
  }

  console.log(chalk.green(`Applied ${result.written.length} change(s).`));
  console.log(chalk.dim(`Backups written to ${result.backupDir}/`));
}
