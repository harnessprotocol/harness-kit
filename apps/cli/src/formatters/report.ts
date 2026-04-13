import type { CompileReport, CompileResult, TargetPlatform } from "@harness-kit/core";
import { buildReport } from "@harness-kit/core";
import chalk from "chalk";

export function formatCompileReport(result: CompileResult, dryRun: boolean): string {
  const report = buildReport(result);
  return formatReport(report, dryRun);
}

function formatReport(report: CompileReport, dryRun: boolean): string {
  const lines: string[] = [];

  if (dryRun) {
    lines.push(chalk.yellow("[DRY RUN]") + " Preview — no files were written.\n");
  }

  lines.push(`Compiled harness: ${chalk.bold(report.harnessName)}`);
  lines.push(`Targets: ${report.targets.map(formatTarget).join(", ")}\n`);

  // Group entries by platform
  let currentPlatform: TargetPlatform | null = null;

  for (const entry of report.entries) {
    if (entry.platform !== currentPlatform) {
      currentPlatform = entry.platform;
    }

    const file = entry.file.padEnd(36);
    const slot = entry.slot.padEnd(14);
    const action = entry.action.padEnd(8);
    const detail = entry.detail;

    lines.push(`  ${chalk.white(file)} ${chalk.dim(slot)} ${action} ${detail}`);
  }

  if (report.skippedPlugins.length > 0) {
    lines.push("");
    lines.push("  Skipped plugins:");
    for (const msg of report.skippedPlugins) {
      lines.push(`    ${chalk.dim(msg)}`);
    }
  }

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("  Warnings:");
    for (const warning of report.warnings) {
      lines.push(`    ${chalk.yellow(warning)}`);
    }
  }

  if (dryRun) {
    lines.push(
      `\n${chalk.yellow("Dry run complete.")} No files were written. Remove --dry-run to apply.`,
    );
  }

  return lines.join("\n");
}

function formatTarget(target: TargetPlatform): string {
  switch (target) {
    case "claude-code":
      return chalk.blue("claude-code");
    case "cursor":
      return chalk.magenta("cursor");
    case "copilot":
      return chalk.green("copilot");
  }
}

export function formatDryRunFile(path: string, content: string): string {
  const lines: string[] = [];
  lines.push(`${chalk.yellow("[DRY RUN]")} Would write: ${chalk.bold(path)}`);
  lines.push(chalk.dim("─".repeat(40)));
  lines.push(content.trimEnd());
  lines.push(chalk.dim("─".repeat(40)));
  return lines.join("\n");
}
