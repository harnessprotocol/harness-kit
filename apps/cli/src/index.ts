import { Command } from "commander";
import { validateCommand } from "./commands/validate.js";
import { compileCommand } from "./commands/compile.js";
import { checkCommand } from "./commands/check.js";
import { detectCommand } from "./commands/detect.js";
import { initCommand, initSkillCommand } from "./commands/init.js";
import { scanCommand } from "./commands/scan.js";
import { syncCommand } from "./commands/sync.js";
import { runCommand } from "./commands/run.js";
import {
  listOrganizations,
  createOrganization,
  joinOrganization,
} from "./commands/org.js";

declare const __CLI_VERSION__: string;

const program = new Command();

program
  .name("harness-kit")
  .description("Compile and validate harness.yaml configurations")
  .version(__CLI_VERSION__);

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
  .option("--force", "Recompile even if source fingerprint is unchanged")
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
  .command("sync")
  .description("Fetch plugins into ~/.harness/cache/ and write harness.lock")
  .argument("[path]", "Path to harness.yaml", "harness.yaml")
  .option("--frozen", "Verify cached plugins without fetching (for CI)")
  .option("--locked", "Fail if harness.lock is out of date with harness.yaml, then fetch")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit sync               Fetch missing plugins, refresh harness.lock
  harness-kit sync --frozen      Verify cache is intact (no network, for CI)
  harness-kit sync --locked      Fail if lock is stale, then fetch

Workflow: harness-kit sync && harness-kit compile`,
  )
  .action(async (path: string, flags) => {
    await syncCommand(path, flags);
  });

program
  .command("check")
  .description("Check compiled output is in sync with harness.yaml (drift detection)")
  .argument("[path]", "Path to harness.yaml", "harness.yaml")
  .option(
    "--target <targets>",
    "Target platforms to check (comma-separated), or all",
  )
  .addHelpText(
    "after",
    `
Examples:
  harness-kit check                         Check all targets
  harness-kit check --target cursor,copilot Check specific targets

Exit code 0 if all ok. Exit code 1 if any drift or missing.`,
  )
  .action(async (path: string, flags) => {
    await checkCommand(path, flags);
  });

program
  .command("detect")
  .description("Show which AI coding platforms are detected in the current directory")
  .action(async () => {
    await detectCommand();
  });

const initCmd = program
  .command("init")
  .description("Scaffold a new harness.yaml or plugin skill")
  .argument("[path]", "Output path for harness.yaml", "harness.yaml")
  .action(async (path: string) => {
    await initCommand(path);
  });

initCmd
  .command("skill")
  .description("Scaffold a new plugin skill")
  .argument("<name>", "Skill name (lowercase kebab-case)")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit init skill my-skill
  harness-kit init skill code-review

Creates:
  skills/<name>/SKILL.md   — Skill definition template
  plugin.json              — Plugin manifest (if not present)`,
  )
  .action(async (name: string) => {
    await initSkillCommand(name);
  });

program
  .command("run")
  .description("Run a skill ephemerally with the active AI tool — nothing persisted")
  .argument("<plugin>", "Plugin name, optionally with source: name@owner/repo or name@./path")
  .option("--tool <tool>", "Tool to use (auto-detected if omitted)")
  .option("--prompt <text>", "Non-interactive: pass a prompt and exit")
  .option("-i, --interactive", "Interactive mode (default when --prompt is omitted)")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit run research                              Auto-detect tool, interactive
  harness-kit run research@harnessprotocol/harness-kit  Explicit source
  harness-kit run my-skill@./plugins/my-skill           Local plugin
  harness-kit run research --tool claude-code --prompt "Analyze this repo"

Nothing is written to harness.yaml, harness.lock, or any persistent skill directory.`,
  )
  .action(async (handle: string, flags) => {
    await runCommand(handle, flags);
  });

program
  .command("scan")
  .description("Run security scan on a plugin directory")
  .argument("[path]", "Path to plugin directory", ".")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit scan                        Scan current directory
  harness-kit scan ./plugins/research     Scan a specific plugin`,
  )
  .action(async (path: string) => {
    await scanCommand(path);
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
