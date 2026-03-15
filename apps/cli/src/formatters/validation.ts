import chalk from "chalk";
import type { ValidationResult } from "@harness-kit/core";

export function formatValidationResult(
  result: ValidationResult,
  filePath: string,
): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push(
      chalk.green(`PASS`) + ` ${filePath} is valid — passes Harness Protocol v1 schema validation.`,
    );
    if (result.isLegacyFormat) {
      lines.push(
        chalk.yellow("Note:") +
          ' This is in the legacy format (version: 1 integer). Run /harness-export to regenerate in Harness Protocol v1 format (version: "1" string).',
      );
    }
  } else {
    lines.push(chalk.red(`FAIL`) + ` ${filePath} failed validation:\n`);

    for (const err of result.errors) {
      lines.push(`  ${chalk.cyan(err.path)}: ${err.message}`);
      if (err.fix) {
        lines.push(`    ${chalk.dim("Fix:")} ${err.fix}`);
      }
      lines.push("");
    }

    lines.push('Fix these issues and run "harness-kit validate" again to confirm.');
  }

  return lines.join("\n");
}
