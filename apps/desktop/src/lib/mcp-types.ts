import type { McpServer, McpServerNetwork } from "@harness-kit/core";

// Claude Code's native server format. `type` is optional on read (older files
// omit it) but `claude mcp add` always writes it, and a url entry without it
// is read as stdio, so the form always writes it.
export interface ClaudeMcpStdio {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ClaudeMcpNetwork {
  type?: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
}

export type ClaudeMcpServer = ClaudeMcpStdio | ClaudeMcpNetwork;

export interface ClaudeMcpConfig {
  mcpServers: Record<string, ClaudeMcpServer>;
}

// Transport type for display (inferred from server shape)
export type McpTransport = "stdio" | "sse" | "http";

export function isNetworkServer(s: ClaudeMcpServer): s is ClaudeMcpNetwork {
  return "url" in s && typeof (s as ClaudeMcpNetwork).url === "string";
}

export function inferTransport(server: ClaudeMcpServer): McpTransport {
  if (isNetworkServer(server)) {
    // An explicit type wins: an SSE endpoint is an https:// URL too.
    if (server.type === "sse" || server.type === "http") return server.type;
    const url = server.url.toLowerCase();
    if (url.startsWith("http://") || url.startsWith("https://")) return "http";
    return "sse";
  }
  return "stdio";
}

// Convert harness.yaml McpServer → Claude mcp.json format (drop the transport field)
export function toClaudeFormat(server: McpServer): ClaudeMcpServer {
  if (server.transport === "stdio") {
    const result: ClaudeMcpStdio = { command: server.command };
    if (server.args?.length) result.args = server.args;
    if (server.env && Object.keys(server.env).length) result.env = server.env;
    return result;
  }
  // network transports (http | sse | ws) — drop the transport field
  const result: ClaudeMcpNetwork = { url: (server as McpServerNetwork).url };
  if (server.headers && Object.keys(server.headers).length) result.headers = server.headers;
  return result;
}

// Convert Claude mcp.json format → harness.yaml McpServer (add explicit transport)
export function toHarnessFormat(server: ClaudeMcpServer): McpServer {
  if (isNetworkServer(server)) {
    const transport = inferTransport(server);
    // harness schema supports "http" | "sse" | "ws" — preserve http for http:// URLs
    const harnessTransport: "sse" | "http" | "ws" = transport === "http" ? "http" : "sse";
    return {
      transport: harnessTransport,
      url: server.url,
      ...(server.headers && Object.keys(server.headers).length ? { headers: server.headers } : {}),
    };
  }
  return {
    transport: "stdio",
    command: server.command,
    ...(server.args?.length ? { args: server.args } : {}),
    ...(server.env && Object.keys(server.env).length ? { env: server.env } : {}),
  };
}
