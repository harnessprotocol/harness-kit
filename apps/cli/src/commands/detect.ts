import { resolve } from "node:path";
import chalk from "chalk";
import { detectPlatforms } from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";

const ALL_PLATFORMS = ["claude-code", "cursor", "copilot"] as const;
type Platform = (typeof ALL_PLATFORMS)[number];

export async function detectCommand(): Promise<void> {
  const fs = new NodeFsProvider();
  const cwd = resolve(".");

  const detected = await detectPlatforms(fs);

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
  console.log(chalk.dim(`${confirmedCount} of 3 platforms detected`));
}
