import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import chalk from "chalk";
import { checkbox, confirm } from "@inquirer/prompts";
import chokidar from "chokidar";
import {
  compile,
  detectPlatforms,
  findOrphanedMarkerBlocks,
  getAllInstructionFilePaths,
  parseHarness,
  removeOrphanedBlocks,
  validateHarness,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import type { OrphanedBlock, TargetPlatform } from "@harness-kit/core";
import { formatCompileReport, formatDryRunFile } from "../formatters/report.js";
import { formatValidationResult } from "../formatters/validation.js";

interface CompileFlags {
  target?: string;
  dryRun?: boolean;
  clean?: boolean;
  verbose?: boolean;
  force?: boolean;
  watch?: boolean;
}

// ── Compile lock (PID-based) ─────────────────────────────────

async function acquireLock(lockPath: string): Promise<void> {
  try {
    const content = await readFile(lockPath, "utf-8");
    const pid = parseInt(content.trim(), 10);
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 0); // Throws if process doesn't exist
        console.error(
          chalk.red("Error:") +
            ` Another compile is running (PID ${pid}). Wait for it to finish or delete ${lockPath}.`,
        );
        process.exit(1);
      } catch {
        // ESRCH: process is gone — stale lock, clean up silently
      }
    }
  } catch {
    // Lock file doesn't exist — that's fine
  }

  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, String(process.pid), "utf-8");
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch {
    // Already gone
  }
}

const ALL_TARGETS: TargetPlatform[] = [
  "claude-code", "cursor", "copilot",
  "codex", "opencode", "windsurf", "gemini", "junie",
];

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

  // Determine targets once up front — --watch reuses the same target list
  // for every recompile rather than re-prompting on each change.
  let targets: TargetPlatform[];
  if (flags.target) {
    targets = parseTargets(flags.target);
  } else {
    // Validate the initial file exists before prompting interactively, so a
    // missing harness.yaml fails fast with the same message as non-watch mode.
    try {
      await readFile(resolved, "utf-8");
    } catch {
      console.error(
        `No harness.yaml found at ${resolved}. Specify a path: harness-kit compile <path>`,
      );
      process.exit(1);
    }
    targets = await interactiveTargetSelection(fs);
  }

  if (targets.length === 0) {
    console.log("No targets selected. Nothing to compile.");
    return;
  }

  if (flags.watch) {
    await watchCompile(resolved, fs, targets, flags);
    return;
  }

  await runCompileOnce(resolved, fs, targets, flags);
}

async function runCompileOnce(
  resolved: string,
  fs: NodeFsProvider,
  targets: TargetPlatform[],
  flags: CompileFlags,
): Promise<void> {
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

  // Stage 1: Acquire compile lock (skip for dry-run)
  const lockPath = join(process.cwd(), ".harness", ".compile-lock");
  if (!flags.dryRun) {
    await acquireLock(lockPath);
  }

  let result;
  try {
    result = await compile(yamlString, targets, fs, {
      dryRun: flags.dryRun,
      clean: flags.clean,
      verbose: flags.verbose,
      force: flags.force,
    });
  } finally {
    // Stage 11: Release lock
    if (!flags.dryRun) {
      await releaseLock(lockPath);
    }
  }

  if (result.upToDate) {
    console.log(chalk.dim("Already up to date."));
    return;
  }

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

// ── Watch mode ─────────────────────────────────────────────────
//
// Debounced chokidar watcher on harness.yaml. On change, recompile within
// 2s and print a short diff summary (files changed vs the prior compile's
// file list) rather than the full compile report every time, so the output
// stays readable across many edits. Ctrl-C exits.

const WATCH_DEBOUNCE_MS = 300;

async function watchCompile(
  resolved: string,
  fs: NodeFsProvider,
  targets: TargetPlatform[],
  flags: CompileFlags,
): Promise<void> {
  console.log(chalk.bold(`Watching ${resolved} for changes...`) + chalk.dim(" (Ctrl-C to stop)"));
  console.log("");

  let previousFiles: Map<string, string> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let rerunQueued = false;

  const recompile = async () => {
    if (running) {
      rerunQueued = true;
      return;
    }
    running = true;
    const start = Date.now();

    try {
      const yamlString = await readFile(resolved, "utf-8");
      const { config } = parseHarness(yamlString);
      const validation = validateHarness(config);
      if (!validation.valid) {
        console.error(formatValidationResult(validation, resolved));
        return;
      }
      if (validation.isLegacyFormat) {
        console.error(
          chalk.red("Error:") +
            ' This harness.yaml uses the legacy format (version: 1 integer). It must use version: "1" (string) for compilation.',
        );
        return;
      }

      const result = await compile(yamlString, targets, fs, {
        dryRun: false,
        clean: flags.clean,
        verbose: flags.verbose,
        force: true, // Watch mode always recompiles on change, ignoring the fingerprint cache.
      });

      const currentFiles = new Map(
        result.files.filter((f) => f.action !== "skip").map((f) => [f.path, f.content]),
      );

      const summary = diffFileSummary(previousFiles, currentFiles);
      previousFiles = currentFiles;

      const elapsedMs = Date.now() - start;
      console.log(
        chalk.dim(`[${new Date().toLocaleTimeString()}]`) +
          ` Recompiled in ${elapsedMs}ms — ${summary}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(chalk.red("Error:") + ` ${msg}`);
    } finally {
      running = false;
      if (rerunQueued) {
        rerunQueued = false;
        await recompile();
      }
    }
  };

  // Initial compile before watching starts.
  await recompile();

  const watcher = chokidar.watch(resolved, { ignoreInitial: true });
  watcher.on("change", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void recompile();
    }, WATCH_DEBOUNCE_MS);
  });

  await new Promise<void>((resolvePromise) => {
    process.on("SIGINT", () => {
      void watcher.close().then(() => resolvePromise());
    });
  });
}

function diffFileSummary(
  previous: Map<string, string> | null,
  current: Map<string, string>,
): string {
  if (previous === null) {
    return `${current.size} file(s) written`;
  }

  let added = 0;
  let changed = 0;
  let removed = 0;

  for (const [path, content] of current) {
    if (!previous.has(path)) added++;
    else if (previous.get(path) !== content) changed++;
  }
  for (const path of previous.keys()) {
    if (!current.has(path)) removed++;
  }

  if (added === 0 && changed === 0 && removed === 0) {
    return "no file changes";
  }

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (changed > 0) parts.push(`${changed} changed`);
  if (removed > 0) parts.push(`${removed} removed`);
  return parts.join(", ");
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
  // Derive scannable files from the canonical slot mappings
  const filesToScan = [...new Set(getAllInstructionFilePaths())];
  const cwd = fs.cwd();
  const allOrphans: OrphanedBlock[] = [];
  const contentCache = new Map<string, string>();

  for (const filePath of filesToScan) {
    const fullPath = fs.joinPath(cwd, filePath);
    let content: string;
    try {
      content = await fs.readFile(fullPath);
    } catch {
      continue; // File doesn't exist
    }

    contentCache.set(filePath, content);
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

  // Group orphans by file and remove using cached content
  const byFile = new Map<string, OrphanedBlock[]>();
  for (const orphan of allOrphans) {
    const existing = byFile.get(orphan.file) ?? [];
    existing.push(orphan);
    byFile.set(orphan.file, existing);
  }

  for (const [filePath, orphans] of byFile) {
    const fullPath = fs.joinPath(cwd, filePath);
    const content = contentCache.get(filePath)!;
    const cleaned = removeOrphanedBlocks(content, orphans);
    await fs.writeFile(fullPath, cleaned);
  }

  console.log(chalk.green(`Removed ${allOrphans.length} orphaned block(s).`));
}
