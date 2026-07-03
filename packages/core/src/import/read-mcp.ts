import type { FsProvider } from "../fs-provider.js";
import type { AdapterId } from "../adapters/adapter.js";
import type { McpServer } from "../types.js";
import { readJsonOrDefault } from "../utils/read-json.js";
import type { ImportedMcpServers, Provenance } from "./types.js";

interface McpJsonEntry {
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
 */
function reverseTranslateServer(entry: McpJsonEntry): McpServer | null {
  const type = entry.type ?? "stdio";

  if (type === "stdio") {
    if (!entry.command) return null;
    const server: McpServer = {
      transport: "stdio",
      command: entry.command,
      ...(entry.args ? { args: entry.args } : {}),
      ...(entry.env ? { env: entry.env } : {}),
    };
    return server;
  }

  if (NETWORK_TRANSPORTS.has(type)) {
    if (!entry.url) return null;
    const server: McpServer = {
      transport: type as "http" | "sse" | "ws",
      url: entry.url,
      ...(entry.headers ? { headers: entry.headers } : {}),
    };
    return server;
  }

  return null;
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
): Promise<{ imported: ImportedMcpServers | null; skipped: Array<{ file: string; reason: string }> }> {
  const fullPath = fs.joinPath(fs.cwd(), relPath);
  const { data, existed } = await readJsonOrDefault<Record<string, unknown>>(fs, fullPath, {});
  const skipped: Array<{ file: string; reason: string }> = [];

  if (!existed) {
    return { imported: null, skipped };
  }

  const mcpServers = data.mcpServers as Record<string, McpJsonEntry> | undefined;
  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return { imported: null, skipped };
  }

  const servers: Record<string, Provenance<McpServer>> = {};

  for (const [name, entry] of Object.entries(mcpServers)) {
    const reversed = reverseTranslateServer(entry);
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
