/**
 * OpenCode's native `opencode.json` shape — verified against the real
 * installed config at ~/.config/opencode/opencode.json (v1.3.13) and the
 * WP-2.0 spike facts. Shared type definitions used by both ./mcp.ts (reverse
 * side) and ./permissions.ts (reverse side) and ./config-file.ts (emit
 * side) — kept in their own module to avoid a mcp.ts <-> permissions.ts
 * import cycle.
 */

export interface OpenCodeLocalMcpEntry {
  type: "local";
  command: string[];
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
}

export interface OpenCodeRemoteMcpEntry {
  type: "remote";
  url: string;
  headers?: Record<string, string>;
  oauth?: Record<string, unknown>;
  enabled?: boolean;
}

export type OpenCodeMcpEntry = OpenCodeLocalMcpEntry | OpenCodeRemoteMcpEntry;

/**
 * OpenCode's native permission shape (verified against spike facts —
 * `permission: { edit, bash: {"<glob>": "allow|ask|deny"}, webfetch, ... }`).
 * Only `edit`/`bash`/`webfetch` are the documented top-level keys; `bash` is
 * itself a glob→verdict map (not a flat allow/deny list), which is why
 * harness-kit's tools.allow/deny/ask maps only partially (see capabilities
 * in ./index.ts — declared "partial", not "full").
 */
export type OpenCodePermissionVerdict = "allow" | "ask" | "deny";

export interface OpenCodePermission {
  edit?: OpenCodePermissionVerdict;
  webfetch?: OpenCodePermissionVerdict;
  bash?: Record<string, OpenCodePermissionVerdict> | OpenCodePermissionVerdict;
}

export interface OpenCodeConfigFile {
  $schema?: string;
  mcp?: Record<string, OpenCodeMcpEntry>;
  permission?: OpenCodePermission;
  instructions?: string[];
  [key: string]: unknown;
}
