import { Command } from "commander";
import { validateCommand } from "./commands/validate.js";
import { compileCommand } from "./commands/compile.js";
import { detectCommand } from "./commands/detect.js";
import { initCommand } from "./commands/init.js";
import {
  listOrganizations,
  createOrganization,
  joinOrganization,
} from "./commands/org.js";

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

program
  .command("detect")
  .description("Show which AI coding platforms are detected in the current directory")
  .action(async () => {
    await detectCommand();
  });

program
  .command("init")
  .description("Scaffold a new harness.yaml interactively")
  .argument("[path]", "Output path for harness.yaml", "harness.yaml")
  .action(async (path: string) => {
    await initCommand(path);
  });

const orgCommand = program
  .command("org")
  .description("Manage organizations");

orgCommand
  .command("list")
  .description("List all organizations")
  .action(async () => {
    await listOrganizations();
  });

orgCommand
  .command("create")
  .description("Create a new organization")
  .action(async () => {
    await createOrganization();
  });

orgCommand
  .command("join")
  .description("Join an organization")
  .argument("<slug>", "Organization slug to join")
  .action(async (slug: string) => {
    await joinOrganization(slug);
  });

program.parse();
