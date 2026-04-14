import { readFile, writeFile, access, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import {
  parseHarness,
  validateHarness,
  directorySignature,
  readLockFile,
  writeLockFile,
  isLockFileFresh,
  getMissingLockEntries,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import type { LockFile, LockedPlugin, HarnessPlugin } from "@harness-kit/core";

const execFileAsync = promisify(execFile);

interface SyncFlags {
  frozen?: boolean;
  locked?: boolean;
}

// ── Cache paths ───────────────────────────────────────────────

function cacheRoot(): string {
  return join(homedir(), ".harness", "cache");
}

function cachePathForSource(source: string): string {
  // Strip github.com/ prefix for cache key
  const key = source.startsWith("github.com/")
    ? source.slice("github.com/".length)
    : source;
  return join(cacheRoot(), ...key.split("/"));
}

// ── Git helpers ───────────────────────────────────────────────

async function gitClone(repoUrl: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await execFileAsync("git", ["clone", "--depth=1", repoUrl, targetDir]);
}

async function gitPull(dir: string): Promise<void> {
  await execFileAsync("git", ["pull", "--ff-only"], { cwd: dir });
}

async function gitRevParse(dir: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: dir,
  });
  return stdout.trim();
}

function sourceToGitUrl(source: string): string {
  const key = source.startsWith("github.com/")
    ? source.slice("github.com/".length)
    : source;
  // Assume GitHub for now — owner/repo format
  return `https://github.com/${key}.git`;
}

function isLocalSource(source: string): boolean {
  return source.startsWith("./") || source.startsWith("../") || source.startsWith("/");
}

// ── Sync a single plugin ──────────────────────────────────────

async function syncPlugin(
  plugin: HarnessPlugin,
  mode: "fetch" | "frozen",
): Promise<LockedPlugin | null> {
  if (isLocalSource(plugin.source)) {
    // Local plugins: verify directory exists
    const localPath = resolve(plugin.source);
    try {
      await access(localPath);
    } catch {
      console.error(
        chalk.red("  error") + ` ${plugin.name}: local path not found: ${localPath}`,
      );
      return null;
    }

    const fs = new NodeFsProvider();
    const hash = await directorySignature(localPath, fs);

    return {
      name: plugin.name,
      source: plugin.source,
      commit: "local",
      contentHash: `sha256:${hash}`,
      installedName: plugin.name,
      path: localPath,
    };
  }

  // Remote plugin
  const cacheDir = cachePathForSource(plugin.source);
  const gitUrl = sourceToGitUrl(plugin.source);

  let cacheExists = false;
  try {
    await access(cacheDir);
    cacheExists = true;
  } catch {
    // Not cached
  }

  if (mode === "frozen") {
    if (!cacheExists) {
      console.error(
        chalk.red("  error") +
          ` ${plugin.name}: not cached at ${cacheDir} (frozen mode — run without --frozen to fetch)`,
      );
      return null;
    }
    // In frozen mode, verify existing cache is intact (don't pull)
  } else {
    // Fetch mode: clone or pull
    try {
      if (cacheExists) {
        process.stdout.write(chalk.dim(`  pulling ${plugin.name}...`));
        await gitPull(cacheDir);
        console.log(chalk.dim(" done"));
      } else {
        process.stdout.write(chalk.dim(`  cloning ${plugin.name} from ${gitUrl}...`));
        await gitClone(gitUrl, cacheDir);
        console.log(chalk.dim(" done"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        chalk.red("  error") + ` ${plugin.name}: git operation failed — ${msg}`,
      );
      // Clean up partial clone
      if (!cacheExists) {
        try {
          await rm(cacheDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
      return null;
    }
  }

  const fs = new NodeFsProvider();
  let commit = "unknown";
  try {
    commit = await gitRevParse(cacheDir);
  } catch {
    // Not a git repo (e.g. manual copy) — skip
  }

  const hash = await directorySignature(cacheDir, fs);

  return {
    name: plugin.name,
    source: plugin.source,
    commit,
    contentHash: `sha256:${hash}`,
    installedName: plugin.name,
  };
}

// ── Main sync command ─────────────────────────────────────────

export async function syncCommand(
  filePath: string | undefined,
  flags: SyncFlags,
): Promise<void> {
  const resolved = resolve(filePath ?? "harness.yaml");
  const lockPath = resolve(resolve("."), "harness.lock");

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
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const validation = validateHarness(config);
  if (!validation.valid) {
    console.error("harness.yaml is invalid — run harness-kit validate for details.");
    process.exit(1);
  }

  const plugins = config.plugins ?? [];

  if (plugins.length === 0) {
    console.log(chalk.dim("No plugins declared — nothing to sync."));
    return;
  }

  // Read existing lockfile (if any)
  let existingLock: LockFile = { version: 1, plugins: [] };
  try {
    const raw = await readFile(lockPath, "utf-8");
    existingLock = readLockFile(raw);
  } catch {
    // No lockfile yet — that's fine for normal and fetch modes
  }

  // --locked: fail if lockfile doesn't cover all declared plugins
  if (flags.locked) {
    const missing = getMissingLockEntries(existingLock, config);
    if (missing.length > 0) {
      console.error(
        chalk.red("Error:") +
          ` harness.lock is out of date. Missing entries: ${missing.join(", ")}`,
      );
      console.error(
        chalk.dim("Run harness-kit sync (without --locked) to update the lockfile."),
      );
      process.exit(1);
    }
    // Lock is fresh — proceed with frozen fetch
  }

  const mode = flags.frozen || flags.locked ? "frozen" : "fetch";

  console.log(
    mode === "frozen"
      ? chalk.bold("Verifying cached plugins (frozen mode)...")
      : chalk.bold("Syncing plugins..."),
  );

  const lockedPlugins: LockedPlugin[] = [];
  let hasError = false;

  for (const plugin of plugins) {
    const locked = await syncPlugin(plugin, mode);
    if (!locked) {
      hasError = true;
      continue;
    }
    lockedPlugins.push(locked);
    if (mode === "fetch") {
      console.log(chalk.green("  ✓") + ` ${plugin.name} (${locked.commit.slice(0, 7)})`);
    } else {
      console.log(chalk.dim(`  verified ${plugin.name}`));
    }
  }

  if (hasError) {
    process.exit(1);
  }

  if (mode === "frozen") {
    console.log(chalk.green("\nAll plugins verified."));
    return;
  }

  // Write lockfile
  const newLock: LockFile = { version: 1, plugins: lockedPlugins };
  const lockContent = writeLockFile(newLock);
  await writeFile(lockPath, lockContent, "utf-8");

  console.log(chalk.green(`\nWrote harness.lock`) + chalk.dim(` (${lockedPlugins.length} plugin(s))`));
}
