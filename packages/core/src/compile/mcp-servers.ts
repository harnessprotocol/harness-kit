import type { FsProvider } from "../fs-provider.js";
import type {
  FileAction,
  HarnessConfig,
  McpServer,
  SurfaceId,
} from "../types.js";
import { readJsonOrDefault } from "../utils/read-json.js";
import { getTarget } from "./targets.js";
import { SECRET_PLACEHOLDER } from "../observe/normalize.js";

export interface McpJsonEntry {
  type: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Portable McpServer -> the native `mcpServers` JSON entry shape, which keys
 * transport as `type`. Shared with the M2 write path (write/write-store.ts)
 * so a synced server is byte-identical to a compiled one — writing the
 * portable shape verbatim would emit our internal `transport` key into the
 * user's config.
 */
export function translateServer(server: McpServer): McpJsonEntry {
  if (server.transport === "stdio") {
    const entry: McpJsonEntry = {
      type: "stdio",
      command: server.command,
    };
    if (server.args) entry.args = server.args;
    if (server.env) entry.env = server.env;
    return entry;
  }
  // Network transports (http, sse, ws)
  const entry: McpJsonEntry = {
    type: server.transport,
    url: server.url,
  };
  if (server.headers) entry.headers = server.headers;
  return entry;
}

/**
 * Refuse a server holding the inventory's `<secret>` placeholder in a value a
 * server reads. It is a stand-in for a hidden credential, not a credential:
 * emitting it would write a config that fails at connect time with no hint why.
 */
export function assertNoSecretPlaceholder(serverName: string, server: McpServer): void {
  const fields: Array<[string, string]> =
    server.transport === "stdio"
      ? [
          ...Object.entries(server.env ?? {}).map(([k, v]): [string, string] => [`env.${k}`, v]),
          ...(server.args ?? []).map((v, i): [string, string] => [`args[${i}]`, v]),
        ]
      : [
          ...Object.entries(server.headers ?? {}).map(([k, v]): [string, string] => [`headers.${k}`, v]),
          ["url", server.url],
        ];
  for (const [field, value] of fields) {
    if (typeof value === "string" && value.includes(SECRET_PLACEHOLDER)) {
      throw new Error(
        `MCP server '${serverName}': ${field} is the placeholder ${SECRET_PLACEHOLDER}, not a value. ` +
          `Set it to a \${NAME} reference or the real value in harness.yaml before compiling.`,
      );
    }
  }
}

export async function compileMcpServers(
  config: HarnessConfig,
  targets: SurfaceId[],
  fs: FsProvider,
): Promise<{ files: FileAction[]; warnings: string[] }> {
  const mcpServers = config["mcp-servers"];
  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return { files: [], warnings: [] };
  }

  const cwd = fs.cwd();
  const files: FileAction[] = [];
  const warnings: string[] = [];

  // Translate all servers
  const translated: Record<string, McpJsonEntry> = {};
  for (const [name, server] of Object.entries(mcpServers)) {
    assertNoSecretPlaceholder(name, server);
    translated[name] = translateServer(server);
  }

  for (const target of targets) {
    const integration = getTarget(target);
    const filePath = integration.mcpConfigFile;
    if (!filePath) {
      // Tool uses global MCP config (e.g. Windsurf) — skip project-level write
      warnings.push(`${integration.label}: MCP config is global-only, skipping project-level write`);
      continue;
    }
    const fullPath = fs.joinPath(cwd, filePath);

    const { data: existing, existed } = await readJsonOrDefault<Record<string, Record<string, unknown>>>(
      fs, fullPath, {},
    );

    const existingServers =
      (existing.mcpServers as Record<string, unknown> | undefined) ?? {};

    // Merge: add new servers, keep existing ones
    const merged = { ...existingServers };
    let serverCount = 0;

    for (const [name, entry] of Object.entries(translated)) {
      if (name in existingServers) {
        warnings.push(
          `${filePath} already defines server '${name}'. The reconciled harness definition will replace it.`,
        );
      }
      merged[name] = entry;
      serverCount++;
    }

    const output = { ...existing, mcpServers: merged };
    const content = JSON.stringify(output, null, 2) + "\n";

    files.push({
      path: filePath,
      content,
      action: existed ? "update" : "create",
      platform: target,
      slot: "mcp-servers",
      linesAdded: serverCount,
    });
  }

  return { files, warnings };
}
