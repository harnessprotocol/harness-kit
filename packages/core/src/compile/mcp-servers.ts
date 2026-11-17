import type { FsProvider } from "../fs-provider.js";
import type {
  FileAction,
  HarnessConfig,
  McpServer,
  SurfaceId,
} from "../types.js";
import { readJsonOrDefault } from "../utils/read-json.js";
import { getTarget } from "./targets.js";
import { toDialect, type EnvRefDialect } from "./env-refs.js";
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
export function translateServer(server: McpServer, dialect: EnvRefDialect = "plain"): McpJsonEntry {
  const d = (v: string) => toDialect(v, dialect);
  const dMap = (m: Record<string, string>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, d(v)]));
  if (server.transport === "stdio") {
    const entry: McpJsonEntry = {
      type: "stdio",
      command: server.command,
    };
    if (server.args) entry.args = server.args.map(d);
    if (server.env) entry.env = dMap(server.env);
    return entry;
  }
  // Network transports (http, sse, ws)
  const entry: McpJsonEntry = {
    type: server.transport,
    url: d(server.url),
  };
  if (server.headers) entry.headers = dMap(server.headers);
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

/**
 * VS Code reads only `servers`; older harness-kit wrote `mcpServers` into
 * .vscode/mcp.json. For a target whose root key is not `mcpServers`, fold a
 * leftover top-level `mcpServers` object into the root key (an entry already
 * there wins) and drop the old key. Shared by compile and the Machine sync
 * write path so both emit the same bytes.
 */
export function migrateLegacyMcpRoot(
  doc: Record<string, unknown>,
  rootKey: string,
): { doc: Record<string, unknown>; moved: number } {
  const legacy = doc.mcpServers;
  if (rootKey === "mcpServers" || typeof legacy !== "object" || legacy === null || Array.isArray(legacy)) {
    return { doc, moved: 0 };
  }
  const { mcpServers: _drop, ...rest } = doc;
  const current = rest[rootKey];
  const currentMap =
    typeof current === "object" && current !== null && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return {
    doc: { ...rest, [rootKey]: { ...(legacy as Record<string, unknown>), ...currentMap } },
    moved: Object.keys(legacy).length,
  };
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

  for (const [name, server] of Object.entries(mcpServers)) {
    assertNoSecretPlaceholder(name, server);
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
    const rootKey = integration.mcpRootKey ?? "mcpServers";
    const dialect = integration.envRefDialect ?? "plain";
    const translated: Record<string, McpJsonEntry> = {};
    for (const [name, server] of Object.entries(mcpServers)) {
      translated[name] = translateServer(server, dialect);
    }

    const { data: rawExisting, existed } = await readJsonOrDefault<Record<string, Record<string, unknown>>>(
      fs, fullPath, {},
    );
    const { doc: existing, moved } = migrateLegacyMcpRoot(rawExisting, rootKey) as {
      doc: Record<string, Record<string, unknown>>;
      moved: number;
    };
    if (moved > 0) {
      warnings.push(
        `Moved ${moved} server(s) from "mcpServers" to "${rootKey}" in ${filePath} (VS Code reads only "${rootKey}").`,
      );
    }

    const existingServers =
      (existing[rootKey] as Record<string, unknown> | undefined) ?? {};

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

    const output = { ...existing, [rootKey]: merged };
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
