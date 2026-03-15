import type {
  CompileReport,
  CompileReportEntry,
  CompileResult,
  TargetPlatform,
} from "../types.js";

const PLATFORM_ORDER: TargetPlatform[] = ["claude-code", "cursor", "copilot"];

const SLOT_ORDER = [
  "operational",
  "behavioral",
  "identity",
  "mcp-servers",
  "permissions",
  "skills",
];

export function buildReport(result: CompileResult): CompileReport {
  const entries: CompileReportEntry[] = [];

  // Sort files by platform order, then slot order
  const sorted = [...result.files].sort((a, b) => {
    const platDiff =
      PLATFORM_ORDER.indexOf(a.platform) -
      PLATFORM_ORDER.indexOf(b.platform);
    if (platDiff !== 0) return platDiff;
    return SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot);
  });

  for (const file of sorted) {
    if (file.action === "skip") continue;

    let detail: string;
    if (file.slot === "mcp-servers") {
      const serverCount = file.linesAdded ?? 0;
      detail = `${serverCount} server${serverCount !== 1 ? "s" : ""}`;
    } else if (file.slot === "permissions") {
      detail = formatPermissionDetail(file.content);
    } else if (file.slot === "skills") {
      detail = "copied";
    } else {
      const lines = file.linesAdded ?? file.content.split("\n").length;
      detail = `${lines} lines added`;
    }

    entries.push({
      file: file.path,
      slot: file.slot,
      action: file.slot === "mcp-servers" || file.slot === "permissions" ? "——" : file.action,
      detail,
      platform: file.platform,
    });
  }

  return {
    harnessName: result.harnessName,
    targets: result.targets,
    entries,
    warnings: result.warnings,
    skippedPlugins: result.skippedPlugins,
  };
}

function formatPermissionDetail(content: string): string {
  try {
    const parsed = JSON.parse(content);
    const perms = parsed.permissions;
    if (!perms) return "updated";
    const allow = perms.allow?.length ?? 0;
    const deny = perms.deny?.length ?? 0;
    const parts: string[] = [];
    if (allow > 0) parts.push(`${allow} allowed`);
    if (deny > 0) parts.push(`${deny} denied`);
    return parts.join(", ") || "updated";
  } catch {
    return "updated";
  }
}
