/**
 * harness run <plugin>[@source] [--tool <tool>] [--prompt <text>] [-i]
 *
 * Ephemeral skill runner — fetch, locate SKILL.md, inject into tool, clean up.
 * Nothing is written to harness.yaml, harness.lock, or any persistent tool directory.
 *
 * Tool launch status per platform:
 *   claude-code  — Writes skill to a temp CLAUDE.md and launches `claude`.
 *                  Claude Code reads CLAUDE.md from CWD, so we launch in a temp dir.
 *   cursor       — TODO: verify --override-rules or equivalent flag
 *   codex        — TODO: verify AGENTS.md override mechanism
 *   (others)     — TODO: verify per-tool skill injection mechanism
 *
 * The launch mechanism is the open question from the plan. What's implemented here
 * is correct for claude-code and is a best-effort stub for others.
 */

import { mkdtemp, rm, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import chalk from "chalk";
import { detectPlatforms, computeSourceDir, findSkillFiles } from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import type { TargetPlatform } from "@harness-kit/core";

interface RunFlags {
  tool?: string;
  prompt?: string;
  interactive?: boolean;
}

// ── Plugin handle parsing ─────────────────────────────────────

interface PluginHandle {
  name: string;
  source: string;
}

/**
 * Parse "name@source" or just "name" (assumes canonical harness-kit source).
 * Examples:
 *   research@harnessprotocol/harness-kit
 *   my-skill@./plugins/my-skill
 *   research   (defaults to harnessprotocol/harness-kit)
 */
function parseHandle(handle: string): PluginHandle {
  const atIdx = handle.indexOf("@");
  if (atIdx === -1) {
    return { name: handle, source: "harnessprotocol/harness-kit" };
  }
  return {
    name: handle.slice(0, atIdx),
    source: handle.slice(atIdx + 1),
  };
}

// ── Locate SKILL.md for a plugin ─────────────────────────────

async function locateSkillMd(
  name: string,
  source: string,
): Promise<string | null> {
  const cwd = process.cwd();
  const home = homedir();

  // Compute source directory
  const sourceDir = computeSourceDir(source, cwd, home, join);
  if (!sourceDir) return null;

  // Verify directory exists
  try {
    await access(sourceDir);
  } catch {
    console.error(
      chalk.yellow("warn") +
        ` Plugin source not found at ${sourceDir}. Run harness-kit sync first.`,
    );
    return null;
  }

  const fs = new NodeFsProvider(sourceDir);

  // 1. Check plugin.json manifest
  const manifestPath = join(sourceDir, "plugin.json");
  try {
    const raw = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(raw) as { skills?: Array<{ name: string; path: string }> };
    if (manifest.skills?.length) {
      for (const skill of manifest.skills) {
        if (skill.name === name || manifest.skills.length === 1) {
          const skillPath = join(sourceDir, skill.path);
          try {
            await access(skillPath);
            return skillPath;
          } catch {
            // Path declared but file missing — fall through
          }
        }
      }
    }
  } catch {
    // No plugin.json or malformed — fall through to walker
  }

  // 2. Walker fallback
  const found = await findSkillFiles(sourceDir, fs);
  return found.length > 0 ? found[0] : null;
}

// ── Tool launch ───────────────────────────────────────────────

async function detectActiveTool(): Promise<TargetPlatform | null> {
  const fs = new NodeFsProvider();
  const detected = await detectPlatforms(fs);
  if (detected.length === 0) return null;
  // Prefer claude-code if present, otherwise first detected
  const cc = detected.find((d) => d.platform === "claude-code");
  return cc ? cc.platform : detected[0].platform;
}

/**
 * Launch the skill ephemerally in a temp directory.
 *
 * For claude-code: write SKILL.md content as a CLAUDE.md in a temp dir,
 * then launch `claude` in that directory (it reads CLAUDE.md from CWD).
 *
 * For other tools: the launch mechanism needs verification — see file header.
 */
async function launchWithSkill(
  skillContent: string,
  tool: TargetPlatform,
  prompt: string | undefined,
  interactive: boolean,
  cleanup: () => Promise<void>,
): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), "harness-run-"));

  // Write skill content to the appropriate file in temp dir
  let launchCmd: string;
  let launchArgs: string[];

  switch (tool) {
    case "claude-code": {
      // Claude Code reads CLAUDE.md from CWD. Write skill there.
      await writeFile(join(tmpDir, "CLAUDE.md"), skillContent, "utf-8");
      launchCmd = "claude";
      launchArgs = [];
      if (prompt) launchArgs.push("--print", prompt);
      break;
    }
    case "cursor": {
      // TODO: verify Cursor's per-invocation rule injection mechanism.
      // Placeholder: write to .cursor/rules/ephemeral.mdc in temp dir.
      const rulesDir = join(tmpDir, ".cursor", "rules");
      await writeFile(join(tmpDir, "AGENTS.md"), skillContent, "utf-8");
      launchCmd = "cursor";
      launchArgs = [tmpDir];
      console.log(
        chalk.yellow("warn") +
          " Cursor ephemeral launch is a best-effort stub — verify .cursor/rules injection mechanism.",
      );
      void rulesDir; // suppress unused warning
      break;
    }
    case "codex": {
      // Codex reads AGENTS.md. Write skill there.
      await writeFile(join(tmpDir, "AGENTS.md"), skillContent, "utf-8");
      launchCmd = "codex";
      launchArgs = prompt ? ["--no-ansi", prompt] : [];
      break;
    }
    default: {
      console.error(
        chalk.red("error") +
          ` Ephemeral launch is not yet implemented for ${tool}. Contributions welcome.`,
      );
      await rm(tmpDir, { recursive: true, force: true });
      await cleanup();
      process.exit(1);
    }
  }

  // Launch tool — inherit stdio for interactive mode
  const child = spawn(launchCmd, launchArgs, {
    cwd: tmpDir,
    stdio: interactive ? "inherit" : ["pipe", "inherit", "inherit"],
    env: process.env,
  });

  if (!interactive && prompt) {
    child.stdin?.end();
  }

  // Wait for tool to exit, then clean up
  await new Promise<void>((resolve, reject) => {
    child.on("exit", () => resolve());
    child.on("error", (err) => reject(err));
  }).finally(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await cleanup();
  });
}

// ── Main run command ──────────────────────────────────────────

export async function runCommand(
  handle: string | undefined,
  flags: RunFlags,
): Promise<void> {
  if (!handle) {
    console.error(
      "Usage: harness-kit run <plugin>[@source] [--tool <tool>] [--prompt <text>] [-i]",
    );
    process.exit(1);
  }

  const { name, source } = parseHandle(handle);

  console.log(chalk.dim(`Locating skill: ${name} from ${source}`));

  // 1. Locate SKILL.md
  const skillPath = await locateSkillMd(name, source);
  if (!skillPath) {
    console.error(
      chalk.red("error") +
        ` Could not locate SKILL.md for ${name}. ` +
        `Try running harness-kit sync first, or specify a local path: ${name}@./path/to/plugin`,
    );
    process.exit(1);
  }

  const skillContent = await readFile(skillPath, "utf-8");
  console.log(chalk.dim(`Found: ${skillPath}`));

  // 2. Detect or resolve tool
  let tool: TargetPlatform;
  if (flags.tool) {
    tool = flags.tool as TargetPlatform;
  } else {
    const detected = await detectActiveTool();
    if (!detected) {
      console.error(
        chalk.red("error") +
          " No AI tool detected in current directory. Use --tool to specify one.",
      );
      process.exit(1);
    }
    tool = detected;
    console.log(chalk.dim(`Detected tool: ${tool}`));
  }

  // 3. Launch (cleanup is a no-op for this path — temp dirs cleaned in launchWithSkill)
  const cleanup = async () => {};
  const interactive = flags.interactive ?? !flags.prompt;

  console.log(chalk.bold(`Running ${name} with ${tool}...`));
  await launchWithSkill(skillContent, tool, flags.prompt, interactive, cleanup);
}
