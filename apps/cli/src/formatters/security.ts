import chalk from "chalk";
import type { SecurityReport, SecurityFinding } from "@harness-kit/shared";

export function formatSecurityReport(
  report: SecurityReport,
  pluginPath: string,
): string {
  const lines: string[] = [];

  // Header with scan status
  if (report.scan_status === "passed") {
    lines.push(
      chalk.green("✓ PASSED") +
        ` ${pluginPath} passed security scan with no critical issues.`,
    );
  } else if (report.scan_status === "warnings") {
    lines.push(
      chalk.yellow("⚠ WARNINGS") +
        ` ${pluginPath} passed with warnings — review before installation.`,
    );
  } else if (report.scan_status === "failed") {
    lines.push(
      chalk.red("✗ FAILED") +
        ` ${pluginPath} failed security scan — critical issues detected.`,
    );
  } else {
    lines.push(chalk.dim("- NOT SCANNED") + ` ${pluginPath}`);
  }

  lines.push("");

  // Plugin info
  lines.push(
    chalk.dim(
      `Plugin: ${report.plugin_name} v${report.plugin_version} | Scanned: ${new Date(report.scan_date).toLocaleString()}`,
    ),
  );
  lines.push("");

  // Summary
  const summary = buildSummary(report);
  lines.push(chalk.bold("Summary:") + ` ${summary}`);
  lines.push("");

  // Findings by severity
  if (report.findings.length > 0) {
    const criticalFindings = report.findings.filter(
      (f) => f.severity === "critical",
    );
    const warningFindings = report.findings.filter(
      (f) => f.severity === "warning",
    );
    const infoFindings = report.findings.filter((f) => f.severity === "info");

    if (criticalFindings.length > 0) {
      lines.push(
        chalk.red.bold(
          `Critical Issues (${criticalFindings.length})`,
        ),
      );
      lines.push("");
      for (const finding of criticalFindings) {
        lines.push(...formatFinding(finding, "critical"));
        lines.push("");
      }
    }

    if (warningFindings.length > 0) {
      lines.push(
        chalk.yellow.bold(`Warnings (${warningFindings.length})`),
      );
      lines.push("");
      for (const finding of warningFindings) {
        lines.push(...formatFinding(finding, "warning"));
        lines.push("");
      }
    }

    if (infoFindings.length > 0) {
      lines.push(
        chalk.cyan.bold(`Informational (${infoFindings.length})`),
      );
      lines.push("");
      for (const finding of infoFindings) {
        lines.push(...formatFinding(finding, "info"));
        lines.push("");
      }
    }
  }

  // Permissions Summary
  lines.push(chalk.bold("Permissions Summary:"));
  lines.push("");

  lines.push(
    `  ${chalk.cyan("Network Access:")} ${report.permissions.network_access ? chalk.yellow("Yes") : chalk.green("No")}`,
  );
  lines.push(
    `  ${chalk.cyan("File Writes:")} ${report.permissions.file_writes ? chalk.yellow("Yes") : chalk.green("No")}`,
  );

  if (report.permissions.env_var_reads.length > 0) {
    lines.push(
      `  ${chalk.cyan("Environment Variables:")} ${report.permissions.env_var_reads.length} variable${report.permissions.env_var_reads.length !== 1 ? "s" : ""}`,
    );
    for (const envVar of report.permissions.env_var_reads) {
      lines.push(`    - ${envVar}`);
    }
  } else {
    lines.push(`  ${chalk.cyan("Environment Variables:")} ${chalk.green("None")}`);
  }

  if (report.permissions.external_urls.length > 0) {
    lines.push(
      `  ${chalk.cyan("External URLs:")} ${report.permissions.external_urls.length} URL${report.permissions.external_urls.length !== 1 ? "s" : ""}`,
    );
    for (const url of report.permissions.external_urls) {
      lines.push(`    - ${url}`);
    }
  } else {
    lines.push(`  ${chalk.cyan("External URLs:")} ${chalk.green("None")}`);
  }

  if (report.permissions.filesystem_patterns.length > 0) {
    lines.push(
      `  ${chalk.cyan("Filesystem Patterns:")} ${report.permissions.filesystem_patterns.length} pattern${report.permissions.filesystem_patterns.length !== 1 ? "s" : ""}`,
    );
    for (const pattern of report.permissions.filesystem_patterns) {
      lines.push(`    - ${pattern}`);
    }
  } else {
    lines.push(`  ${chalk.cyan("Filesystem Patterns:")} ${chalk.green("None")}`);
  }

  lines.push("");

  // Footer with action suggestion
  if (report.scan_status === "failed") {
    lines.push(
      chalk.red(
        'Do NOT install this plugin until critical issues are resolved. Contact the plugin author or report the issue.',
      ),
    );
  } else if (report.scan_status === "warnings") {
    lines.push(
      chalk.yellow(
        "Review warnings carefully before installing. Some patterns may be intentional but require your judgment.",
      ),
    );
  } else if (report.scan_status === "passed") {
    lines.push(
      chalk.green(
        "This plugin passed all security checks. You can proceed with installation.",
      ),
    );
  }

  return lines.join("\n");
}

// ── Helper functions ────────────────────────────────────────

function formatFinding(
  finding: SecurityFinding,
  severity: "critical" | "warning" | "info",
): string[] {
  const lines: string[] = [];

  // Severity indicator
  const indicator =
    severity === "critical"
      ? chalk.red("  ✗")
      : severity === "warning"
        ? chalk.yellow("  ⚠")
        : chalk.cyan("  ℹ");

  // Message
  lines.push(`${indicator} ${finding.message}`);

  // File path and line number
  if (finding.file_path) {
    let location = `    ${chalk.dim(finding.file_path)}`;
    if (finding.line_number) {
      location += chalk.dim(`:${finding.line_number}`);
    }
    lines.push(location);
  }

  // Code snippet
  if (finding.code_snippet) {
    lines.push(`    ${chalk.dim("Code:")} ${chalk.dim(finding.code_snippet)}`);
  }

  // Recommendation
  if (finding.recommendation) {
    lines.push(
      `    ${chalk.dim("Fix:")} ${finding.recommendation}`,
    );
  }

  return lines;
}

function buildSummary(report: SecurityReport): string {
  const parts: string[] = [];

  if (report.critical_count > 0) {
    parts.push(
      chalk.red(
        `${report.critical_count} critical issue${report.critical_count !== 1 ? "s" : ""}`,
      ),
    );
  }

  if (report.warning_count > 0) {
    parts.push(
      chalk.yellow(
        `${report.warning_count} warning${report.warning_count !== 1 ? "s" : ""}`,
      ),
    );
  }

  if (report.info_count > 0) {
    parts.push(
      chalk.cyan(
        `${report.info_count} info`,
      ),
    );
  }

  if (parts.length === 0) {
    return chalk.green("No issues found");
  }

  return parts.join(", ");
}
