import { Command } from "commander";
import chalk from "chalk";
import { validateCommand } from "./commands/validate.js";
import { compileCommand } from "./commands/compile.js";
import { checkCommand } from "./commands/check.js";
import { detectCommand } from "./commands/detect.js";
import { initCommand, initSkillCommand } from "./commands/init.js";
import { scanCommand } from "./commands/scan.js";
import { syncCommand } from "./commands/sync.js";
import { importCommand } from "./commands/import.js";
import { statusCommand } from "./commands/status.js";
import { diffCommand } from "./commands/diff.js";
import { fixCommand } from "./commands/fix.js";
import { captureCommand } from "./commands/capture.js";
import { reconcileCommand } from "./commands/reconcile.js";
import { applyCommand } from "./commands/apply.js";
import { rollbackCommand } from "./commands/rollback.js";
import {
  skillsApplyCommand,
  skillsDiscoverCommand,
  skillsPromoteCommand,
  skillsReconcileCommand,
  skillsRollbackCommand,
  skillsUpdateCommand,
} from "./commands/skills.js";
import {
  listOrganizations,
  createOrganization,
  joinOrganization,
} from "./commands/org.js";
import {
  keygenCommand,
  offerCommand,
  acceptCommand,
} from "./commands/exchange.js";

declare const __CLI_VERSION__: string;

// NO_COLOR / dumb terminal support (https://no-color.org)
if (process.env.NO_COLOR !== undefined || process.env.TERM === "dumb") {
  chalk.level = 0;
}

const program = new Command();

program
  .name("harness-kit")
  .description("Compile and validate harness.yaml configurations")
  .version(__CLI_VERSION__)
  .option("--no-color", "Disable colored output")
  .hook("preAction", (thisCommand) => {
    if (thisCommand.opts().color === false) {
      chalk.level = 0;
    }
  });

program
  .command("validate")
  .description("Validate a harness.yaml against the Harness Protocol v1 schema")
  .argument("[path]", "Path to harness.yaml", "harness.yaml")
  .option("--json", "Output results as JSON")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit validate                    Validate ./harness.yaml
  harness-kit validate ~/dotfiles/harness.yaml   Validate a specific file`,
  )
  .action(async (path: string, flags) => {
    await validateCommand(path, flags);
  });

program
  .command("compile")
  .description("Compile harness.yaml into native config files for AI coding tools")
  .argument("[path]", "Path to harness.yaml", "harness.yaml")
  .option(
    "--target <targets>",
    "Target platforms: claude-code, cursor, copilot, codex, opencode, windsurf, gemini, junie (comma-separated), or all",
  )
  .option("--dry-run", "Preview output without writing files")
  .option("--clean", "Remove orphaned marker blocks from previous compilations")
  .option("--verbose", "Show skipped slots and extra detail")
  .option("--force", "Recompile even if source fingerprint is unchanged")
  .option("--watch", "Watch harness.yaml and recompile automatically on change")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit compile                           Interactive platform detection
  harness-kit compile --target all --dry-run    Preview output for all platforms
  harness-kit compile --target claude-code      Compile for Claude Code only
  harness-kit compile --target cursor,copilot   Compile for Cursor and Copilot
  harness-kit compile --clean                   Compile and remove orphaned blocks
  harness-kit compile --watch                   Recompile automatically on harness.yaml changes`,
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
  .option("--json", "Output results as JSON")
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
  .option("--json", "Output results as JSON")
  .action(async (flags) => {
    await detectCommand(flags);
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
  .command("import")
  .description("Scan existing AI tool configs and synthesize a harness.yaml")
  .option("--global", "Also scan user-level (global) config roots, merged into the result")
  .option("--dry-run", "Preview the synthesized harness.yaml without writing it")
  .option("--force", "Overwrite an existing harness.yaml")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit import                Scan the current project and write harness.yaml
  harness-kit import --dry-run      Preview the synthesized harness.yaml
  harness-kit import --global       Also scan global config, merged into the result
  harness-kit import --force        Overwrite an existing harness.yaml`,
  )
  .action(async (flags) => {
    await importCommand(flags);
  });

program
  .command("capture")
  .description("Capture native harness state into a secret-safe Harness Protocol v2 profile")
  .option("--scope <scope>", "Capture scope: personal, project, or session", "project")
  .option("--output <path>", "Output profile path")
  .option("--dry-run", "Preview without writing")
  .option("--force", "Replace an existing profile transactionally")
  .option("--json", "Output a machine-readable capture report")
  .action(async (flags) => {
    await captureCommand(flags);
  });

const collectResolution = (value: string, previous: string[]): string[] => [...previous, value];

program
  .command("reconcile")
  .description("Three-way reconcile native state, the last-applied base, and layered profiles")
  .argument("[path]", "Project harness profile", "harness.yaml")
  .option("--organization <path>", "Organization profile")
  .option("--personal <path>", "Personal profile (defaults to ~/.harness/harness.yaml when present)")
  .option("--session <path>", "Ephemeral session overlay")
  .option("--target <targets>", "Comma-separated targets, or all", "all")
  .option("--resolve <conflict=choice>", "Resolve one conflict; may be repeated", collectResolution, [])
  .option("--json", "Output the full reconciliation plan as JSON")
  .action(async (path: string, flags) => {
    await reconcileCommand(path, flags);
  });

program
  .command("apply")
  .description("Preview or transactionally apply a reconciled whole-harness configuration")
  .argument("[path]", "Project harness profile", "harness.yaml")
  .option("--organization <path>", "Organization profile")
  .option("--personal <path>", "Personal profile (defaults to ~/.harness/harness.yaml when present)")
  .option("--session <path>", "Ephemeral session overlay (source-only unless a target has native support)")
  .option("--target <targets>", "Comma-separated targets, or all", "all")
  .option("--resolve <conflict=choice>", "Resolve one conflict; may be repeated", collectResolution, [])
  .option("--adopt", "Explicitly claim an unowned native file shown in the preview")
  .option("--yes", "Apply the previewed transaction (default is preview only)")
  .option("--json", "Output the apply preview as JSON")
  .action(async (path: string, flags) => {
    await applyCommand(path, flags);
  });

program
  .command("rollback")
  .description("Preview or restore a complete prior Harness Kit transaction")
  .option("--transaction <path>", "Transaction manifest (defaults to last-known-good)")
  .option("--yes", "Execute the rollback (default is preview only)")
  .option("--json", "Output the rollback preview as JSON")
  .action(async (flags) => {
    await rollbackCommand(flags);
  });

const addSkillLayerOptions = (command: Command): Command => command
  .option("--organization <path>", "Organization profile")
  .option("--personal <path>", "Personal profile (defaults to ~/.harness/harness.yaml when present)")
  .option("--session <path>", "Ephemeral session overlay")
  .option("--target <targets>", "Comma-separated targets, or all", "all")
  .option("--resolve <conflict=choice>", "Resolve one conflict; may be repeated", collectResolution, [])
  .option("--json", "Output machine-readable JSON");

const skillsCommand = program
  .command("skills")
  .description("Discover, promote, reconcile, deploy, update, and roll back skill catalogs");

skillsCommand
  .command("discover")
  .description("Discover project and optional personal skills, grouped by content fingerprint")
  .option("--global", "Include personal catalogs")
  .option("--json", "Output machine-readable JSON")
  .action(async (flags) => {
    await skillsDiscoverCommand(flags);
  });

skillsCommand
  .command("promote")
  .description("Pin an in-place skill or package it as a validated content-addressed capsule")
  .argument("<directory>", "Skill directory containing SKILL.md")
  .option("--mode <mode>", "Promotion mode: reference or capsule", "reference")
  .option("--scope <scope>", "Catalog scope: personal or project", "personal")
  .option("--profile <path>", "Profile to update")
  .option("--source <owner/repo/path>", "Explicit source identity")
  .option("--revision <commit>", "Pinned source revision")
  .option("--publisher <name>", "Capsule publisher", "personal")
  .option("--name <name>", "Deployment alias (defaults to skill frontmatter)")
  .option("--version <version>", "Capsule semantic version", "0.1.0")
  .option("--include <path>", "Explicit local dependency; may be repeated", collectResolution, [])
  .option("--replace", "Choose this skill as the explicit winner for an existing alias")
  .option("--yes", "Commit the promotion (default is preview only)")
  .option("--json", "Output machine-readable JSON")
  .action(async (directory: string, flags) => {
    await skillsPromoteCommand(directory, flags);
  });

const skillsReconcile = addSkillLayerOptions(
  skillsCommand.command("reconcile").description("Three-way reconcile only skill resources"),
).argument("[path]", "Project harness profile", "harness.yaml");
skillsReconcile.action(async (path: string, flags) => {
  await skillsReconcileCommand(path, flags);
});

const skillsApply = addSkillLayerOptions(
  skillsCommand.command("apply").description("Preview or deploy only reconciled skill resources"),
)
  .argument("[path]", "Project harness profile", "harness.yaml")
  .option("--adopt", "Explicitly claim an unowned native skill file")
  .option("--yes", "Apply transactionally (default is preview only)");
skillsApply.action(async (path: string, flags) => {
  await skillsApplyCommand(path, flags);
});

const skillsUpdate = addSkillLayerOptions(
  skillsCommand.command("update").description("Preview or approve pinned skill catalog updates"),
)
  .argument("[path]", "Project harness profile", "harness.yaml")
  .option("--adopt", "Explicitly claim an unowned native skill file")
  .option("--yes", "Approve and apply updates (default is preview only)");
skillsUpdate.action(async (path: string, flags) => {
  await skillsUpdateCommand(path, flags);
});

skillsCommand
  .command("rollback")
  .description("Preview or roll back a skill deployment transaction")
  .option("--transaction <path>", "Transaction manifest (defaults to last-known-good)")
  .option("--yes", "Execute the rollback")
  .option("--json", "Output machine-readable JSON")
  .action(async (flags) => {
    await skillsRollbackCommand(flags);
  });

program
  .command("status")
  .description("Show the fleet: which harnesses are installed, where, and how drifted")
  .option("--global", "Include the personal catalog and global native tool state")
  .option("--json", "Output the raw FleetReport as JSON")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit status              Human-readable fleet table
  harness-kit status --json       Machine-readable FleetReport`,
  )
  .action(async (flags) => {
    await statusCommand(flags);
  });

program
  .command("diff")
  .description("Show drift between harness.yaml and deployed tool configs")
  .argument("[path]", "Path to harness.yaml", "harness.yaml")
  .option(
    "--target <targets>",
    "Target platforms to check (comma-separated), or all",
  )
  .option("--json", "Output the raw DriftReport as JSON")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit diff                        Show drift for all targets
  harness-kit diff --target claude-code   Show drift for Claude Code only

Exit code 0 if no drift. Exit code 1 if any drift.`,
  )
  .action(async (path: string, flags) => {
    await diffCommand(path, flags);
  });

program
  .command("fix")
  .description("Repair drift between harness.yaml and deployed tool configs")
  .argument("[path]", "Path to harness.yaml", "harness.yaml")
  .option(
    "--target <targets>",
    "Target platforms to fix (comma-separated), or all",
  )
  .option("--apply", "Execute the fix plan (default is dry-run preview only)")
  .option("--yes", "Skip the confirmation prompt when applying")
  .option("--json", "Output the raw FixPlan as JSON")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit fix                  Preview the fix plan (dry run, default)
  harness-kit fix --apply          Apply the fix plan (writes a backup first)
  harness-kit fix --apply --yes    Apply without the confirmation prompt

"user-modified-outside" items are never auto-repaired — they are listed for manual review.`,
  )
  .action(async (path: string, flags) => {
    await fixCommand(path, flags);
  });

program
  .command("scan")
  .description("Run security scan on a plugin directory")
  .argument("[path]", "Path to plugin directory", ".")
  .option("--json", "Output results as JSON")
  .addHelpText(
    "after",
    `
Examples:
  harness-kit scan                        Scan current directory
  harness-kit scan ./plugins/research     Scan a specific plugin`,
  )
  .action(async (path: string, flags) => {
    await scanCommand(path, flags);
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

// ─── exchange command group ───────────────────────────────────────────────────

const exchangeCommand = program
  .command("exchange")
  .description("Peer-to-peer harness fragment sharing (HEP-7)");

exchangeCommand
  .command("keygen")
  .description("Generate an ed25519 keypair for Exchange")
  .option("--force", "Overwrite an existing keypair")
  .option("--json", "Output as JSON")
  .action(async (flags) => {
    await keygenCommand(flags);
  });

exchangeCommand
  .command("offer")
  .description("Build and sign an offer envelope from a fragment file")
  .argument("<fragment>", "Path to the fragment .harness.yaml file")
  .option("--out <file>", "Write the offer envelope to a file (default: stdout)")
  .option("--expires <value>", "Expiry: ISO 8601 or +Nd/+Nh shorthand (default: +7d)")
  .option("--message <text>", "Optional message to include in the offer")
  .option("--json", "Force JSON output")
  .action(async (fragment: string, flags) => {
    await offerCommand(fragment, flags);
  });

exchangeCommand
  .command("accept")
  .description("Review and accept/edit/reject a received offer envelope")
  .argument("<offer>", "Path to the offer JSON file")
  .option("--into <harness>", "Target harness.yaml to add the extends entry (default: ./harness.yaml)")
  .option("--yes", "Auto-accept without the interactive prompt (preview is still shown)")
  .option("--json", "Output result as JSON")
  .action(async (offer: string, flags) => {
    await acceptCommand(offer, flags);
  });

program.addHelpText('after', '\nDocs: https://harnesskit.ai/docs\n');

program.parse();
