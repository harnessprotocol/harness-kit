import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import { checkbox, confirm } from "@inquirer/prompts";
import {
  compile,
  detectPlatforms,
  findOrphanedMarkerBlocks,
  parseHarness,
  removeOrphanedBlocks,
  validateHarness,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import type { TargetPlatform } from "@harness-kit/core";
import { formatCompileReport, formatDryRunFile } from "../formatters/report.js";
import { formatValidationResult } from "../formatters/validation.js";

interface CompileFlags {
  target?: string;
  dryRun?: boolean;
  clean?: boolean;
  verbose?: boolean;
}

const ALL_TARGETS: TargetPlatform[] = ["claude-code", "cursor", "copilot"];

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

export async function compileCommand(
  filePath: string | undefined,
  flags: CompileFlags,
): Promise<void> {
  const resolved = resolve(filePath ?? "harness.yaml");
  const fs = new NodeFsProvider();

  // Read harness.yaml
  let yamlString: string;
  try {
    yamlString = await readFile(resolved, "utf-8");
  } catch {
    console.error(
      `No harness.yaml found at ${resolved}. Specify a path: harness-kit compile <path>`,
    );
    process.exit(1);
  }

  // Parse and validate
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
    console.error(formatValidationResult(validation, resolved));
    process.exit(1);
  }

  if (validation.isLegacyFormat) {
    console.error(
      chalk.red("Error:") +
        ' This harness.yaml uses the legacy format (version: 1 integer). It must use version: "1" (string) for compilation.',
    );
    process.exit(1);
  }

  // Determine targets
  let targets: TargetPlatform[];
  if (flags.target) {
    targets = parseTargets(flags.target);
  } else {
    targets = await interactiveTargetSelection(fs);
  }

  if (targets.length === 0) {
    console.log("No targets selected. Nothing to compile.");
    return;
  }

  // Compile
  const result = await compile(yamlString, targets, fs, {
    dryRun: flags.dryRun,
    clean: flags.clean,
    verbose: flags.verbose,
  });

  // Dry-run: show file previews
  if (flags.dryRun) {
    for (const file of result.files) {
      if (file.action !== "skip") {
        console.log(formatDryRunFile(file.path, file.content));
        console.log("");
      }
    }
  }

  // Print report
  console.log(formatCompileReport(result, flags.dryRun ?? false));

  // Handle --clean
  if (flags.clean && !flags.dryRun) {
    await handleClean(result.harnessName, targets, fs);
  }
}

async function interactiveTargetSelection(
  fs: NodeFsProvider,
): Promise<TargetPlatform[]> {
  const detected = await detectPlatforms(fs);

  if (detected.length === 0) {
    console.log(
      "No AI tool config directories found. Which targets should I compile for?",
    );
    const selected = await checkbox<TargetPlatform>({
      message: "Select targets:",
      choices: ALL_TARGETS.map((t) => ({ name: t, value: t })),
    });
    return selected;
  }

  const choices = ALL_TARGETS.map((t) => {
    const det = detected.find((d) => d.platform === t);
    const found = det ? ` (found: ${det.indicators.join(", ")})` : " (not detected)";
    return {
      name: `${t}${found}`,
      value: t,
      checked: det ? !det.needsConfirmation : false,
    };
  });

  const selected = await checkbox<TargetPlatform>({
    message: "Detected targets. Confirm or adjust:",
    choices,
  });

  return selected;
}

async function handleClean(
  harnessName: string,
  targets: TargetPlatform[],
  fs: NodeFsProvider,
): Promise<void> {
  // Files that could contain harness marker blocks
  const filesToScan = [
    "CLAUDE.md",
    "AGENT.md",
    "SOUL.md",
    ".cursor/rules/harness.mdc",
    ".cursor/rules/behavioral.mdc",
    ".github/copilot-instructions.md",
    ".github/instructions/behavioral.instructions.md",
  ];

  const cwd = fs.cwd();
  const allOrphans: import("@harness-kit/core").OrphanedBlock[] = [];

  for (const filePath of filesToScan) {
    const fullPath = fs.joinPath(cwd, filePath);
    if (!(await fs.exists(fullPath))) continue;

    const content = await fs.readFile(fullPath);
    const orphans = findOrphanedMarkerBlocks(content, harnessName, filePath);
    allOrphans.push(...orphans);
  }

  if (allOrphans.length === 0) {
    console.log(chalk.dim("\nNo orphaned marker blocks found."));
    return;
  }

  console.log(chalk.yellow(`\nFound ${allOrphans.length} orphaned marker block(s):\n`));
  for (const orphan of allOrphans) {
    console.log(
      `  ${chalk.cyan(orphan.file)} lines ${orphan.startLine}-${orphan.endLine}: harness:${orphan.name}:${orphan.slot}`,
    );
  }

  const proceed = await confirm({
    message: `Remove these ${allOrphans.length} orphaned blocks?`,
    default: false,
  });

  if (!proceed) {
    console.log("Cleanup skipped.");
    return;
  }

  // Group orphans by file and remove
  const byFile = new Map<string, import("@harness-kit/core").OrphanedBlock[]>();
  for (const orphan of allOrphans) {
    const existing = byFile.get(orphan.file) ?? [];
    existing.push(orphan);
    byFile.set(orphan.file, existing);
  }

  for (const [filePath, orphans] of byFile) {
    const fullPath = fs.joinPath(cwd, filePath);
    const content = await fs.readFile(fullPath);
    const cleaned = removeOrphanedBlocks(content, orphans);
    await fs.writeFile(fullPath, cleaned);
  }

  console.log(chalk.green(`Removed ${allOrphans.length} orphaned block(s).`));
}
