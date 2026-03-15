import type { FsProvider } from "../fs-provider.js";
import type {
  FileAction,
  HarnessConfig,
  HarnessPermissions,
  TargetPlatform,
} from "../types.js";
import { readJsonOrDefault } from "../utils/read-json.js";

export async function compilePermissions(
  config: HarnessConfig,
  targets: TargetPlatform[],
  fs: FsProvider,
): Promise<{ files: FileAction[]; warnings: string[] }> {
  const perms = config.permissions;
  if (!perms) {
    return { files: [], warnings: [] };
  }

  const cwd = fs.cwd();
  const files: FileAction[] = [];
  const warnings: string[] = [];

  for (const target of targets) {
    if (target === "claude-code") {
      const result = await compileClaudeCodePermissions(perms, fs, cwd);
      files.push(result);
    } else {
      const text = buildPermissionsText(perms);
      if (text) {
        // Permissions text is appended to the operational instruction file
        // via marker blocks — the instructions compiler handles the file.
        // We just return a standalone FileAction for the report.
        const denyList = perms.tools?.deny;
        if (denyList && denyList.length > 0) {
          warnings.push(
            `permissions.tools.deny is not machine-enforceable for target '${target}'.\n  Denied tools: ${denyList.join(", ")}\n  Instructions have been updated to describe the intended permissions,\n  but manual tool configuration is required.`,
          );
        }
      }
    }
  }

  return { files, warnings };
}

async function compileClaudeCodePermissions(
  perms: HarnessPermissions,
  fs: FsProvider,
  cwd: string,
): Promise<FileAction> {
  const settingsPath = fs.joinPath(cwd, ".claude/settings.json");

  const { data: existing, existed } = await readJsonOrDefault<Record<string, unknown>>(
    fs, settingsPath, {},
  );

  const permissionsObj: Record<string, unknown> = {};

  if (perms.tools?.allow) {
    permissionsObj.allow = perms.tools.allow;
  }
  if (perms.tools?.deny) {
    permissionsObj.deny = perms.tools.deny;
  }
  if (perms.paths) {
    // Claude Code's additionalDirectories grants full read+write access.
    // Only map writable paths; readonly paths would gain unintended write access.
    const dirs = perms.paths.writable ?? [];
    if (dirs.length > 0) {
      permissionsObj.additionalDirectories = dirs;
    }
  }

  const output = { ...existing, permissions: permissionsObj };
  const content = JSON.stringify(output, null, 2) + "\n";

  const allowCount = perms.tools?.allow?.length ?? 0;
  const denyCount = perms.tools?.deny?.length ?? 0;

  return {
    path: ".claude/settings.json",
    content,
    action: existed ? "update" : "create",
    platform: "claude-code",
    slot: "permissions",
    linesAdded: allowCount + denyCount,
  };
}

export function buildPermissionsText(perms: HarnessPermissions): string | null {
  const lines: string[] = ["## Tool Permissions", ""];
  lines.push("This harness specifies the following tool permissions:");

  let hasContent = false;

  if (perms.tools?.allow && perms.tools.allow.length > 0) {
    lines.push(`- **Allowed**: ${perms.tools.allow.join(", ")}`);
    hasContent = true;
  }
  if (perms.tools?.deny && perms.tools.deny.length > 0) {
    lines.push(`- **Denied**: ${perms.tools.deny.join(", ")}`);
    hasContent = true;
  }
  if (perms.tools?.ask && perms.tools.ask.length > 0) {
    lines.push(`- **Ask before use**: ${perms.tools.ask.join(", ")}`);
    hasContent = true;
  }

  if (!hasContent) return null;

  lines.push("");
  lines.push("Please configure your tool's permission settings to match these constraints.");

  return lines.join("\n");
}
