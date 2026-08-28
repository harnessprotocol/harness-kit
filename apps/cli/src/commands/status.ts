import { resolve, basename } from "node:path";
import chalk from "chalk";
import { buildFleetReport } from "@harness-kit/core";
import type { FleetReport, FleetScopeInput, FleetStatus } from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import { buildReconciliationContext, summarizePlan } from "./portability-common.js";

interface StatusFlags {
  json?: boolean;
  global?: boolean;
}

function statusColor(status: FleetStatus): string {
  switch (status) {
    case "in-sync":
      return chalk.green("in-sync");
    case "drift":
      return chalk.yellow("drift");
    case "not-configured":
      return chalk.dim("not-configured");
    case "not-installed":
      return chalk.dim("not-installed");
  }
}

function cellText(report: FleetReport, adapter: string, scopeRoot: string): string {
  const row = report.rows.find((r) => r.adapter === adapter);
  const cell = row?.cells[scopeRoot];
  if (!cell) return chalk.dim("—");
  if (cell.status === "drift") {
    return `${statusColor(cell.status)} ${chalk.dim(`(${cell.driftCount})`)}`;
  }
  return statusColor(cell.status);
}

function formatTable(report: FleetReport): string {
  const lines: string[] = [];

  const adapterCol = 16;
  const scopeCol = 22;

  const header = ["harness".padEnd(adapterCol), ...report.scopes.map((s) => s.label.padEnd(scopeCol))];
  lines.push(chalk.bold(header.join("")));

  for (const row of report.rows) {
    const cells = report.scopes.map((s) => cellText(report, row.adapter, s.root));
    // padEnd on colored strings pads by visible length incorrectly, so pad
    // the plain label/column widths using raw text lengths computed before
    // chalk wraps them where possible; scopeCol is generous enough in
    // practice for the four current adapter ids + status words.
    const line = [row.adapter.padEnd(adapterCol), ...cells.map((c) => c.padEnd(scopeCol))];
    lines.push(line.join(""));
  }

  lines.push("");
  lines.push(
    chalk.dim(
      `${report.summary.inSync} in-sync, ${report.summary.drift} drift, ` +
        `${report.summary.notConfigured} not-configured, ${report.summary.notInstalled} not-installed`,
    ),
  );

  return lines.join("\n");
}

export async function statusCommand(flags: StatusFlags): Promise<void> {
  const cwd = resolve(".");
  const projectFs = new NodeFsProvider(cwd);
  const projectLabel = basename(cwd);
  const scopes: FleetScopeInput[] = [{ kind: "project", label: projectLabel, fs: projectFs }];
  if (flags.global) {
    const home = await projectFs.homedir();
    scopes.push({
      kind: "global" as const,
      label: "personal",
      fs: new NodeFsProvider(home),
      profilePath: ".harness/harness.yaml",
    });
  }

  const report = await buildFleetReport({
    scopes,
  });
  let reconciliation: Record<string, unknown> | undefined;
  if (await projectFs.exists(projectFs.joinPath(cwd, "harness.yaml"))) {
    try {
      reconciliation = summarizePlan((await buildReconciliationContext("harness.yaml", {})).plan);
    } catch {
      // Fleet status remains available for legacy or partially configured profiles.
    }
  }

  if (flags.json) {
    console.log(JSON.stringify({ ...report, ...(reconciliation ? { reconciliation } : {}) }));
    return;
  }

  console.log(chalk.bold(`Fleet status for ${cwd}`));
  console.log("");
  console.log(formatTable(report));
  if ((reconciliation as { blocked?: boolean } | undefined)?.blocked) {
    console.log("");
    console.log(chalk.yellow("Whole-harness reconciliation has unresolved conflicts."));
  }

  if (report.summary.drift > 0 || (reconciliation as { blocked?: boolean } | undefined)?.blocked) {
    process.exit(1);
  }
}
