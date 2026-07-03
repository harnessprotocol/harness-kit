import type { FsProvider } from "../../fs-provider.js";
import type { McpServer } from "../../types.js";
import { readJsonOrDefault } from "../../utils/read-json.js";
import type { ImportedMcpServers, Provenance } from "../../import/types.js";
import type { OpenCodeConfigFile, OpenCodeMcpEntry } from "./types.js";

export type { OpenCodeConfigFile, OpenCodeMcpEntry, OpenCodeLocalMcpEntry, OpenCodeRemoteMcpEntry } from "./types.js";

/**
 * Reverses the emit-side translateServer() in ./config-file.ts. Returns null
 * for entries lacking enough structure to round-trip (mirrors
 * readMcpConfigFile's reverseTranslateServer contract) — callers record
 * these as skipped-with-reason.
 */
function reverseTranslateServer(entry: OpenCodeMcpEntry): McpServer | null {
  if (entry.type === "local") {
    if (!entry.command || entry.command.length === 0) return null;
    const [command, ...args] = entry.command;
    const server: McpServer = {
      transport: "stdio",
      command,
      ...(args.length > 0 ? { args } : {}),
      ...(entry.environment ? { env: entry.environment } : {}),
    };
    return server;
  }
  if (entry.type === "remote") {
    if (!entry.url) return null;
    const server: McpServer = {
      transport: "http",
      url: entry.url,
      ...(entry.headers ? { headers: entry.headers } : {}),
    };
    return server;
  }
  return null;
}

const OPENCODE_CONFIG_FILE = "opencode.json";

/**
 * Reverse: opencode.json's `mcp` key → ImportedMcpServers. Mirrors
 * readMcpConfigFile()'s contract exactly but against the OpenCode-native
 * shape (translate/reverse pair with ./config-file.ts's emit side), not the
 * generic mcpServers shape.
 */
export async function readOpenCodeMcp(
  fs: FsProvider,
  adapter: "opencode",
): Promise<{ imported: ImportedMcpServers | null; skipped: Array<{ file: string; reason: string }> }> {
  const cwd = fs.cwd();
  const fullPath = fs.joinPath(cwd, OPENCODE_CONFIG_FILE);
  const { data, existed } = await readJsonOrDefault<OpenCodeConfigFile>(fs, fullPath, {});
  const skipped: Array<{ file: string; reason: string }> = [];

  if (!existed) return { imported: null, skipped };

  const mcp = data.mcp;
  if (!mcp || Object.keys(mcp).length === 0) return { imported: null, skipped };

  const servers: Record<string, Provenance<McpServer>> = {};

  for (const [name, entry] of Object.entries(mcp)) {
    const reversed = reverseTranslateServer(entry);
    if (!reversed) {
      skipped.push({
        file: OPENCODE_CONFIG_FILE,
        reason: `mcp server '${name}' has an unrecognized or incomplete shape (type: ${entry.type}) — skipped, not imported.`,
      });
      continue;
    }
    servers[name] = { value: reversed, source: { adapter, file: OPENCODE_CONFIG_FILE } };
  }

  if (Object.keys(servers).length === 0) return { imported: null, skipped };
  return { imported: { servers }, skipped };
}
