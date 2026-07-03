import { access, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { importProjectValidated } from "@harness-kit/core";
import type { ImportFindings, ImportProjectResult, HarnessConfig } from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";

interface ImportFlags {
  global?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

// ── Findings summary formatting ────────────────────────────────

function formatFindingsSummary(findings: ImportFindings, driftNote = ""): string {
  const lines: string[] = [];
  lines.push(chalk.bold("Findings:"));

  for (const adapter of findings.adapters) {
    const label = adapter.adapter.padEnd(14);
    if (!adapter.detected && adapter.found.length === 0) {
      lines.push(`  ${chalk.dim("✗")} ${chalk.dim(label)} ${chalk.dim("not detected")}`);
      continue;
    }

    // Count-forward: "Claude Code: 9 files, 3 drifted"
    const fileCount = new Set(adapter.found.map((f) => f.file)).size;
    const parts = [`${fileCount} file${fileCount === 1 ? "" : "s"}`];
    if (adapter.skipped.length > 0) {
      parts.push(`${adapter.skipped.length} skipped`);
    }
    lines.push(`  ${chalk.green("✓")} ${label} ${parts.join(", ")}${driftNote}`);

    for (const found of adapter.found) {
      lines.push(chalk.dim(`      ${found.file} — ${found.detail}`));
    }
    for (const skipped of adapter.skipped) {
      lines.push(chalk.yellow(`      skipped: ${skipped.file} — ${skipped.reason}`));
    }
    for (const warning of adapter.warnings) {
      lines.push(chalk.yellow(`      warning: ${warning}`));
    }
  }

  return lines.join("\n");
}

function formatConflicts(result: ImportProjectResult): string | null {
  if (result.provenance.conflicts.length === 0) return null;
  const lines: string[] = [];
  lines.push("");
  lines.push(chalk.yellow(`${result.provenance.conflicts.length} conflict(s) recorded under x-harness-import:`));
  for (const conflict of result.provenance.conflicts) {
    lines.push(`  ${conflict.field}:`);
    for (const alt of conflict.alternates) {
      lines.push(chalk.dim(`      ${alt.adapter} (${alt.source.file}): ${JSON.stringify(alt.value)}`));
    }
  }
  return lines.join("\n");
}

// ── Global-scope merge ──────────────────────────────────────────
//
// Core's importProject() only ever scans one FsProvider root at a time
// (see packages/core/src/import/import-project.ts — it takes cwd() as the
// project root, with no notion of "also scan this other root"). Rather than
// extending core's synthesizer to understand multiple roots (out of scope —
// core's engine behavior is frozen for this WP), --global runs a SECOND,
// independent importProject() pass rooted at the user's home directory and
// merges its result into the project-scoped harness.yaml here, at the CLI
// layer. This is a simple, non-destructive union:
//   - instructions: global text is appended as a labeled block per slot
//     (never overwrites project text)
//   - mcp-servers: global servers are added only for names the project
//     scan didn't already produce (project wins on name collision)
//   - permissions: allow/deny/ask/paths/hosts lists are unioned
// This merge logic lives in the CLI, not core, precisely because it's a
// judgment call specific to how `harness import --global` presents results
// — a different caller (desktop) is free to compose the same two
// importProject() calls differently.
function mergeGlobalIntoProject(project: HarnessConfig, global: HarnessConfig): HarnessConfig {
  const merged: HarnessConfig = { ...project };

  if (global.instructions) {
    const mergedInstructions = { ...(merged.instructions ?? {}) };
    for (const slot of ["operational", "behavioral", "identity"] as const) {
      const globalText = global.instructions[slot];
      if (!globalText) continue;
      const projectText = mergedInstructions[slot];
      mergedInstructions[slot] = projectText
        ? `${projectText}\n\n<!-- source: global config -->\n${globalText}`
        : globalText;
    }
    merged.instructions = mergedInstructions;
  }

  if (global["mcp-servers"]) {
    const mergedServers = { ...(merged["mcp-servers"] ?? {}) };
    for (const [name, server] of Object.entries(global["mcp-servers"])) {
      if (!(name in mergedServers)) mergedServers[name] = server;
    }
    merged["mcp-servers"] = mergedServers;
  }

  if (global.permissions) {
    const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];
    merged.permissions = {
      tools: {
        allow: union(merged.permissions?.tools?.allow, global.permissions.tools?.allow),
        deny: union(merged.permissions?.tools?.deny, global.permissions.tools?.deny),
        ask: union(merged.permissions?.tools?.ask, global.permissions.tools?.ask),
      },
      paths: {
        writable: union(merged.permissions?.paths?.writable, global.permissions.paths?.writable),
        readonly: union(merged.permissions?.paths?.readonly, global.permissions.paths?.readonly),
      },
      network: {
        "allowed-hosts": union(
          merged.permissions?.network?.["allowed-hosts"],
          global.permissions.network?.["allowed-hosts"],
        ),
      },
    };
  }

  return merged;
}

// ── Main command ─────────────────────────────────────────────────

export async function importCommand(flags: ImportFlags): Promise<void> {
  const cwd = resolve(".");
  const projectFs = new NodeFsProvider(cwd);
  const projectName = basename(cwd);

  let projectResult: ImportProjectResult;
  try {
    projectResult = await importProjectValidated({
      fs: projectFs,
      name: projectName,
      description: `Synthesized from existing tool configurations in ${projectName} by harness-kit import.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(chalk.red("Error:") + ` ${msg}`);
    process.exit(1);
  }

  console.log(chalk.bold(`Scanning ${cwd}`));
  console.log("");
  console.log(formatFindingsSummary(projectResult.findings));

  let finalYaml = projectResult.harnessYaml;
  let finalConfig = projectResult.harnessConfig;

  if (flags.global) {
    const homeFs = new NodeFsProvider(await projectFs.homedir());
    let globalResult: ImportProjectResult;
    try {
      globalResult = await importProjectValidated({
        fs: homeFs,
        name: projectName,
        description: "Synthesized from global tool configurations by harness-kit import.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(chalk.red("Error scanning global config:") + ` ${msg}`);
      process.exit(1);
    }

    console.log("");
    console.log(chalk.bold(`Scanning global config (${await projectFs.homedir()})`));
    console.log("");
    console.log(formatFindingsSummary(globalResult.findings));

    finalConfig = mergeGlobalIntoProject(projectResult.harnessConfig, globalResult.harnessConfig);
    const { stringify } = await import("yaml");
    finalYaml = stringify(finalConfig, { lineWidth: 0 });
  }

  const conflictsText = formatConflicts(projectResult);
  if (conflictsText) console.log(conflictsText);

  const outPath = resolve("harness.yaml");
  let existing = false;
  try {
    await access(outPath);
    existing = true;
  } catch {
    // Doesn't exist — fine.
  }

  if (flags.dryRun) {
    console.log("");
    console.log(chalk.yellow("[DRY RUN]") + ` Would write: ${chalk.bold(outPath)}`);
    console.log(chalk.dim("─".repeat(40)));
    console.log(finalYaml.trimEnd());
    console.log(chalk.dim("─".repeat(40)));
    return;
  }

  if (existing && !flags.force) {
    console.log("");
    console.log(
      chalk.yellow("harness.yaml already exists.") +
        ` Re-run with ${chalk.bold("--force")} to overwrite, or ${chalk.bold("--dry-run")} to preview without writing.`,
    );
    process.exit(1);
  }

  if (existing && flags.force) {
    const proceed = await confirm({
      message: `Overwrite existing ${outPath}?`,
      default: false,
    });
    if (!proceed) {
      console.log(chalk.dim("Aborted."));
      return;
    }
  }

  await writeFile(outPath, finalYaml, "utf-8");
  console.log("");
  console.log(chalk.green(`Wrote ${outPath}`));
  console.log(chalk.dim("Run harness compile to generate platform config files."));
}
