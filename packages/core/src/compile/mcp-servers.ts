import type { FsProvider } from "../fs-provider.js";
import type { FileAction, HarnessConfig, McpServer, TargetPlatform } from "../types.js";
import { readJsonOrDefault } from "../utils/read-json.js";

const MCP_FILE_MAP: Record<TargetPlatform, string> = {
  "claude-code": ".mcp.json",
  cursor: ".cursor/mcp.json",
  copilot: ".vscode/mcp.json",
};

interface McpJsonEntry {
  type: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

function translateServer(server: McpServer): McpJsonEntry {
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

export async function compileMcpServers(
  config: HarnessConfig,
  targets: TargetPlatform[],
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
    translated[name] = translateServer(server);
  }

  for (const target of targets) {
    const filePath = MCP_FILE_MAP[target];
    const fullPath = fs.joinPath(cwd, filePath);

    const { data: existing, existed } = await readJsonOrDefault<
      Record<string, Record<string, unknown>>
    >(fs, fullPath, {});

    const existingServers = (existing.mcpServers as Record<string, unknown> | undefined) ?? {};

    // Merge: add new servers, keep existing ones
    const merged = { ...existingServers };
    let serverCount = 0;

    for (const [name, entry] of Object.entries(translated)) {
      if (name in existingServers) {
        warnings.push(
          `${filePath} already defines server '${name}'. Existing config kept.\n  To update it, edit ${filePath} directly or remove the entry and re-run.`,
        );
      } else {
        merged[name] = entry;
        serverCount++;
      }
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
