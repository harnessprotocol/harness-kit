import { Command } from "commander";
import { validateCommand } from "./commands/validate.js";
import { compileCommand } from "./commands/compile.js";

const program = new Command();

program
  .name("harness-kit")
  .description("Compile and validate harness.yaml configurations")
  .version("0.1.0");

program
  .command("validate")
  .description("Validate a harness.yaml against the Harness Protocol v1 schema")
  .argument("[path]", "Path to harness.yaml", "harness.yaml")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit validate                    Validate ./harness.yaml
  harness-kit validate ~/dotfiles/harness.yaml   Validate a specific file`,
  )
  .action(async (path: string) => {
    await validateCommand(path);
  });

program
  .command("compile")
  .description("Compile harness.yaml into native config files for AI coding tools")
  .argument("[path]", "Path to harness.yaml", "harness.yaml")
  .option(
    "--target <targets>",
    "Target platforms: claude-code, cursor, copilot (comma-separated), or all",
  )
  .option("--dry-run", "Preview output without writing files")
  .option("--clean", "Remove orphaned marker blocks from previous compilations")
  .option("--verbose", "Show skipped slots and extra detail")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit compile                           Interactive platform detection
  harness-kit compile --target all --dry-run    Preview output for all platforms
  harness-kit compile --target claude-code      Compile for Claude Code only
  harness-kit compile --target cursor,copilot   Compile for Cursor and Copilot
  harness-kit compile --clean                   Compile and remove orphaned blocks`,
  )
  .action(async (path: string, flags) => {
    await compileCommand(path, flags);
  });

program.parse();
