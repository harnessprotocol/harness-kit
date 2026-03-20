import type { ClaudeConfigScan } from "./tauri";

export const HARNESS_TEMPLATE = `version: "1"
metadata:
  name: my-harness
  description: My AI assistant configuration.

# mcp-servers:
#   my-server:
#     transport: stdio
#     command: npx
#     args: [-y, my-mcp-package]

# instructions:
#   operational: |
#     You are a helpful assistant.

# permissions:
#   tools:
#     allow: []
#     deny: []
`;

/** Generate a harness.yaml string from existing Claude Code config files. */
export function generateHarnessYaml(scan: ClaudeConfigScan): string {
  const lines: string[] = [
    'version: "1"',
    "metadata:",
    "  name: my-harness",
    "  description: Generated from existing Claude Code configuration.",
    "",
  ];

  // MCP servers from ~/.claude/.mcp.json
  if (scan.mcpServersJson) {
    try {
      const parsed = JSON.parse(scan.mcpServersJson) as {
        mcpServers?: Record<string, {
          command?: string;
          args?: string[];
          env?: Record<string, string>;
          url?: string;
          type?: string;
        }>;
      };
      const servers = parsed.mcpServers ?? {};
      const entries = Object.entries(servers);

      if (entries.length > 0) {
        lines.push("mcp-servers:");
        for (const [name, server] of entries) {
          lines.push(`  ${name}:`);
          // Network transport (SSE/HTTP)
          if (server.url) {
            lines.push(`    transport: sse`);
            lines.push(`    url: ${server.url}`);
          } else {
            lines.push(`    transport: stdio`);
            if (server.command) lines.push(`    command: ${server.command}`);
            if (server.args && server.args.length > 0) {
              lines.push(`    args:`);
              for (const arg of server.args) {
                // Quote args containing spaces or special chars
                const needsQuote = /[\s:{}[\],#&*?|<>=!%@`]/.test(arg);
                lines.push(`      - ${needsQuote ? JSON.stringify(arg) : arg}`);
              }
            }
            if (server.env && Object.keys(server.env).length > 0) {
              lines.push(`    env:`);
              for (const [k, v] of Object.entries(server.env)) {
                lines.push(`      ${k}: ${v}`);
              }
            }
          }
        }
        lines.push("");
      }
    } catch {
      // malformed .mcp.json — skip
    }
  }

  // Permissions from ~/.claude/settings.json
  if (scan.settingsJson) {
    try {
      const settings = JSON.parse(scan.settingsJson) as {
        allowedTools?: string[];
        blockedTools?: string[];
        allowedDirectories?: string[];
      };

      const allow = settings.allowedTools ?? [];
      const deny = settings.blockedTools ?? [];
      const writablePaths = settings.allowedDirectories ?? [];

      if (allow.length > 0 || deny.length > 0 || writablePaths.length > 0) {
        lines.push("permissions:");
        if (allow.length > 0 || deny.length > 0) {
          lines.push("  tools:");
          if (allow.length > 0) {
            lines.push("    allow:");
            for (const t of allow) lines.push(`      - ${t}`);
          }
          if (deny.length > 0) {
            lines.push("    deny:");
            for (const t of deny) lines.push(`      - ${t}`);
          }
        }
        if (writablePaths.length > 0) {
          lines.push("  paths:");
          lines.push("    writable:");
          for (const p of writablePaths) lines.push(`      - ${p}`);
        }
        lines.push("");
      }
    } catch {
      // malformed settings.json — skip
    }
  }

  return lines.join("\n");
}
