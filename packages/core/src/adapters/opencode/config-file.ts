import type { FsProvider } from "../../fs-provider.js";
import type { FileAction, HarnessConfig, McpServer } from "../../types.js";
import { readJsonOrDefault } from "../../utils/read-json.js";
import type { OpenCodeConfigFile, OpenCodeMcpEntry } from "./types.js";
import { buildOpenCodePermission } from "./permissions.js";

const OPENCODE_CONFIG_FILE = "opencode.json";

function translateServer(server: McpServer): OpenCodeMcpEntry {
  if (server.transport === "stdio") {
    return {
      type: "local",
      command: [server.command, ...(server.args ?? [])],
      ...(server.env ? { environment: server.env } : {}),
    };
  }
  return {
    type: "remote",
    url: server.url,
    ...(server.headers ? { headers: server.headers } : {}),
  };
}

/**
 * Emits (or merges into) opencode.json in ONE write covering both the `mcp`
 * and `permission` keys — OpenCode's mcp and permissions surfaces live in
 * the same native config file, so unlike claude-code/cursor/copilot (which
 * each write mcp and permissions to separate files), this adapter must merge
 * both domains into a single FileAction rather than two competing writes to
 * the same path.
 *
 * Non-destructive: existing top-level keys, existing mcp server names, and
 * existing permission.bash globs are all preserved as-is; harness-kit only
 * adds entries not already present, warning when it skips a name collision.
 */
export async function compileOpenCodeConfigFile(
  config: HarnessConfig,
  fs: FsProvider,
): Promise<{ file: FileAction | null; warnings: string[] }> {
  const mcpServers = config["mcp-servers"];
  const perms = config.permissions;
  const permission = perms ? buildOpenCodePermission(perms) : null;

  if ((!mcpServers || Object.keys(mcpServers).length === 0) && !permission) {
    return { file: null, warnings: [] };
  }

  const warnings: string[] = [];
  if (perms?.paths || perms?.network) {
    warnings.push(
      "opencode: permissions.paths and permissions.network have no OpenCode equivalent (no path/network allowlist support) — not exported to opencode.json. See AGENTS.md instructions for a human-readable summary instead.",
    );
  }

  const cwd = fs.cwd();
  const fullPath = fs.joinPath(cwd, OPENCODE_CONFIG_FILE);
  const { data: existing, existed } = await readJsonOrDefault<OpenCodeConfigFile>(fs, fullPath, {});

  const output: OpenCodeConfigFile = { ...existing };
  if (!output.$schema) output.$schema = "https://opencode.ai/config.json";

  let mcpCount = 0;
  if (mcpServers && Object.keys(mcpServers).length > 0) {
    const existingMcp = existing.mcp ?? {};
    const mergedMcp: Record<string, OpenCodeMcpEntry> = { ...existingMcp };
    for (const [name, server] of Object.entries(mcpServers)) {
      if (name in existingMcp) {
        warnings.push(
          `${OPENCODE_CONFIG_FILE} already defines mcp server '${name}'. Existing config kept.\n  To update it, edit ${OPENCODE_CONFIG_FILE} directly or remove the entry and re-run.`,
        );
        continue;
      }
      mergedMcp[name] = translateServer(server);
      mcpCount++;
    }
    output.mcp = mergedMcp;
  }

  let bashCount = 0;
  if (permission?.bash && typeof permission.bash === "object") {
    const existingPermission = existing.permission ?? {};
    const existingBash =
      typeof existingPermission.bash === "object" ? existingPermission.bash : {};
    const mergedBash = { ...existingBash };
    for (const [glob, verdict] of Object.entries(permission.bash)) {
      if (glob in existingBash) continue;
      mergedBash[glob] = verdict;
      bashCount++;
    }
    output.permission = { ...existingPermission, bash: mergedBash };
  }

  const file: FileAction = {
    path: OPENCODE_CONFIG_FILE,
    content: JSON.stringify(output, null, 2) + "\n",
    action: existed ? "update" : "create",
    platform: "opencode",
    slot: "mcp-permissions",
    linesAdded: mcpCount + bashCount,
  };

  return { file, warnings };
}
