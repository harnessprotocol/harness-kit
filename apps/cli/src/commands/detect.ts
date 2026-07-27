import { resolve } from "node:path";
import chalk from "chalk";
import { detectPlatforms, getCheckableTargets } from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";

interface DetectFlags {
  json?: boolean;
}

export async function detectCommand(flags: DetectFlags = {}): Promise<void> {
  const fs = new NodeFsProvider();
  const cwd = resolve(".");

  // Derived from core's target registry rather than hardcoded, so this list
  // can't silently fall behind as new compile targets are added (it used to
  // be pinned to just claude-code/cursor/copilot while core already
  // supported 8 platforms — Windsurf, Junie, Gemini, OpenCode, and Codex
  // configs were detected internally but never shown here).
  const ALL_PLATFORMS = getCheckableTargets();

  const detected = await detectPlatforms(fs);

  if (flags.json) {
    const tools = detected.map((entry) => ({
      platform: entry.platform,
      indicators: entry.indicators,
      needsConfirmation: entry.needsConfirmation ?? false,
    }));
    console.log(JSON.stringify({ tools }));
    return;
  }

  console.log(chalk.bold(`Detected platforms in ${cwd}`));
  console.log("");

  let confirmedCount = 0;

  for (const platform of ALL_PLATFORMS) {
    const entry = detected.find((d) => d.platform === platform);

    if (!entry) {
      console.log(
        `  ${chalk.dim("✗")} ${chalk.dim(platform.padEnd(12))}  ${chalk.dim("no indicators found")}`,
      );
    } else if (entry.needsConfirmation) {
      confirmedCount++;
      const indicators = entry.indicators.join(", ");
      console.log(
        `  ${chalk.yellow("~")} ${platform.padEnd(12)}  ${chalk.dim(indicators)} ${chalk.yellow("(needs confirmation)")}`,
      );
    } else {
      confirmedCount++;
      const indicators = entry.indicators.join(", ");
      console.log(
        `  ${chalk.green("✓")} ${platform.padEnd(12)}  ${chalk.dim(indicators)}`,
      );
    }
  }

  console.log("");
  console.log(chalk.dim(`${confirmedCount} of ${ALL_PLATFORMS.length} platforms detected`));
}
