import type { FsProvider } from "../fs-provider.js";
import type { AdapterId } from "../adapters/adapter.js";
import { migrateLegacyMcpRoot } from "../compile/mcp-servers.js";
import { getTarget } from "../compile/targets.js";
import type { McpServer, SurfaceId } from "../types.js";
import { fromDialect, type EnvRefDialect } from "../compile/env-refs.js";
import { readJsonOrDefault } from "../utils/read-json.js";
import type { ImportedMcpServers, Provenance } from "./types.js";

export interface McpJsonEntry {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

const NETWORK_TRANSPORTS = new Set(["http", "sse", "ws"]);

/**
 * Reverses `translateServer()` in compile/mcp-servers.ts. Returns null for an
 * entry that doesn't have enough structure to be a valid McpServer (missing
 * command for stdio, missing url for network) — callers record these as
 * skipped-with-reason rather than silently dropping them.
 *
 * Exported for reuse by the read-side store executors (observe/read-store.ts)
 * so both paths translate the common shapes identically.
 */
export function reverseTranslateServer(
  entry: McpJsonEntry,
  dialect: EnvRefDialect = "plain",
): McpServer | null {
  const d = (v: string) => (dialect === "vscode" ? fromDialect(v) : v);
  const dMap = (m: Record<string, string>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === "string" ? d(v) : v]));
  // Precedence: an explicit `type` wins. With no `type`, `command` means
  // stdio and a `url` without a `command` means a remote (http) server —
  // Cursor and Claude Code both write url entries with no `type`.
  const type = entry.type ?? (entry.url && !entry.command ? "http" : "stdio");

  if (type === "stdio") {
    if (!entry.command) return null;
    const server: McpServer = {
      transport: "stdio",
      command: entry.command,
      ...(entry.args ? { args: entry.args.map((a) => (typeof a === "string" ? d(a) : a)) } : {}),
      ...(entry.env ? { env: dMap(entry.env) } : {}),
    };
    return server;
  }

  // Any non-stdio type that carries a url is remote. Known transports keep
  // their name; spellings like "streamable-http" read as http.
  if (entry.url) {
    const server: McpServer = {
      transport: NETWORK_TRANSPORTS.has(type) ? (type as "http" | "sse" | "ws") : "http",
      url: d(entry.url),
      ...(entry.headers ? { headers: dMap(entry.headers) } : {}),
    };
    return server;
  }

  return null;
}

/** Root key and env-ref dialect for a compile target's MCP file, from target metadata. */
export function mcpReadOptions(target: SurfaceId): { rootKey?: string; envRefDialect?: EnvRefDialect } {
  const t = getTarget(target);
  return {
    ...(t.mcpRootKey ? { rootKey: t.mcpRootKey } : {}),
    ...(t.envRefDialect ? { envRefDialect: t.envRefDialect } : {}),
  };
}

/**
 * Read an MCP config JSON file (`.mcp.json`, `.cursor/mcp.json`,
 * `.vscode/mcp.json`, etc.) in the `{ mcpServers: { name: {...} } }` shape
 * that compileMcpServers() writes, and reverse it into ImportedMcpServers
 * with per-server provenance.
 *
 * Returns null if the file doesn't exist, isn't valid JSON, or has no
 * `mcpServers` object. Entries that fail to reverse-translate are reported
 * via the `skipped` array rather than silently dropped.
 */
export async function readMcpConfigFile(
  fs: FsProvider,
  relPath: string,
  adapter: AdapterId,
  options: { rootKey?: string; envRefDialect?: EnvRefDialect } = {},
): Promise<{ imported: ImportedMcpServers | null; skipped: Array<{ file: string; reason: string }> }> {
  const fullPath = fs.joinPath(fs.cwd(), relPath);
  const { data, existed } = await readJsonOrDefault<Record<string, unknown>>(fs, fullPath, {});
  const skipped: Array<{ file: string; reason: string }> = [];

  if (!existed) {
    return { imported: null, skipped };
  }

  const rootKey = options.rootKey ?? "mcpServers";
  // Older harness-kit wrote `mcpServers` into files whose root key is
  // `servers`; read leftovers too (the root key wins) so nothing vanishes.
  const mcpServers = migrateLegacyMcpRoot(data, rootKey).doc[rootKey] as Record<string, McpJsonEntry> | undefined;
  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return { imported: null, skipped };
  }

  const servers: Record<string, Provenance<McpServer>> = {};

  for (const [name, entry] of Object.entries(mcpServers)) {
    const reversed = reverseTranslateServer(entry, options.envRefDialect);
    if (!reversed) {
      skipped.push({
        file: relPath,
        reason: `mcp server '${name}' has an unrecognized or incomplete shape (type: ${entry.type ?? "stdio"}) — skipped, not imported.`,
      });
      continue;
    }
    servers[name] = { value: reversed, source: { adapter, file: relPath } };
  }

  if (Object.keys(servers).length === 0) {
    return { imported: null, skipped };
  }

  return { imported: { servers }, skipped };
}
