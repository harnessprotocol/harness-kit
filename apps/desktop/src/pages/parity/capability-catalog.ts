import type { TargetPlatform } from "@harness-kit/core";

export type CapabilityCategory = "config" | "plugin" | "runtime" | "protocol";

export interface SupportEntry {
  supported: boolean;
  path?: string;
  format?: string;
  note?: string;
}

export interface Capability {
  id: string;
  category: CapabilityCategory;
  label: string;
  description: string;
  /** ISO date — when harness-kit started tracking this capability. Rows added
   *  within the last 7 days render a NEW ribbon. */
  added_at: string;
  support: Record<TargetPlatform, SupportEntry>;
}

// Only file-based config capabilities are selectable for batch compile.
// Directory-type capabilities (skills-dir) and non-config rows are informational only.
export function isSelectable(cap: Capability): boolean {
  return cap.category === "config" && cap.id !== "skills-dir";
}

export const CAPABILITIES: Capability[] = [
  // ── Config files ──────────────────────────────────────────────────────────

  {
    id: "instructions-file",
    category: "config",
    label: "Instructions file",
    description:
      "Primary instruction document the harness auto-loads on every session. " +
      "Claude Code reads CLAUDE.md; most other harnesses read AGENTS.md. " +
      "Harness Kit compiles a single source into each target's format.",
    added_at: "2025-09-01",
    support: {
      "claude-code": { supported: true,  path: "CLAUDE.md" },
      cursor:        { supported: true,  path: ".cursor/rules/harness.mdc" },
      copilot:       { supported: true,  path: ".github/copilot-instructions.md" },
      codex:         { supported: true,  path: "AGENTS.md" },
      opencode:      { supported: true,  path: "AGENTS.md" },
      windsurf:      { supported: true,  path: "AGENTS.md" },
      gemini:        { supported: true,  path: "AGENTS.md" },
      junie:         { supported: true,  path: "AGENTS.md" },
    },
  },
  {
    id: "mcp-config",
    category: "config",
    label: "MCP config",
    description:
      "Project-level MCP server config that tells the harness which external " +
      "tools to load. Each harness uses a different file path and some use " +
      "JSON while others use TOML.",
    added_at: "2025-09-01",
    support: {
      "claude-code": { supported: true,  path: ".mcp.json",               format: "json" },
      cursor:        { supported: true,  path: ".cursor/mcp.json",         format: "json" },
      copilot:       { supported: true,  path: ".vscode/mcp.json",         format: "json" },
      codex:         { supported: false, note: "TOML format — not yet supported by compile" },
      opencode:      { supported: true,  path: "opencode.json",            format: "json" },
      windsurf:      { supported: false, note: "Global-only (~/.codeium/windsurf/mcp_config.json)" },
      gemini:        { supported: true,  path: ".gemini/settings.json",    format: "json" },
      junie:         { supported: true,  path: ".junie/mcp/mcp.json",      format: "json" },
    },
  },
  {
    id: "skills-dir",
    category: "config",
    label: "Skills directory",
    description:
      "Directory of SKILL.md files the harness reads as callable procedures. " +
      "Claude Code installs skills via the plugin registry; other harnesses " +
      "read them directly from a project-relative path.",
    added_at: "2025-09-01",
    support: {
      "claude-code": { supported: true,  path: "~/.claude/skills/",     note: "Managed by plugin registry" },
      cursor:        { supported: true,  path: ".cursor/skills/" },
      copilot:       { supported: true,  path: ".github/skills/" },
      codex:         { supported: true,  path: ".agents/skills/" },
      opencode:      { supported: true,  path: ".opencode/skills/" },
      windsurf:      { supported: true,  path: ".windsurf/skills/" },
      gemini:        { supported: true,  path: ".gemini/skills/" },
      junie:         { supported: true,  path: ".junie/skills/" },
    },
  },
  {
    id: "settings-file",
    category: "config",
    label: "Settings / permissions",
    description:
      "Harness-specific settings file controlling permissions, allowed tools, " +
      "model overrides, and environment variables.",
    added_at: "2025-09-01",
    support: {
      "claude-code": { supported: true,  path: ".claude/settings.json",  format: "json" },
      cursor:        { supported: false },
      copilot:       { supported: false },
      codex:         { supported: false },
      opencode:      { supported: false },
      windsurf:      { supported: false },
      gemini:        { supported: true,  path: ".gemini/settings.json",   format: "json" },
      junie:         { supported: false },
    },
  },

  // ── Plugin components ─────────────────────────────────────────────────────

  {
    id: "slash-commands",
    category: "plugin",
    label: "Slash commands",
    description:
      "User-invokable custom slash commands the harness exposes in its chat UI.",
    added_at: "2025-09-01",
    support: {
      "claude-code": { supported: true },
      cursor:        { supported: true },
      copilot:       { supported: false },
      codex:         { supported: true },
      opencode:      { supported: true },
      windsurf:      { supported: false },
      gemini:        { supported: false },
      junie:         { supported: false },
    },
  },
  {
    id: "lifecycle-hooks",
    category: "plugin",
    label: "Lifecycle hooks",
    description:
      "Scripts triggered by events such as PreToolUse, PostToolUse, and Stop. " +
      "Unique to Claude Code today.",
    added_at: "2025-09-01",
    support: {
      "claude-code": { supported: true },
      cursor:        { supported: false },
      copilot:       { supported: false },
      codex:         { supported: false },
      opencode:      { supported: false },
      windsurf:      { supported: false },
      gemini:        { supported: false },
      junie:         { supported: false },
    },
  },
  {
    id: "subagents",
    category: "plugin",
    label: "Subagent delegation",
    description:
      "Ability to delegate tasks to specialist subagents that run autonomously " +
      "in parallel.",
    added_at: "2025-09-01",
    support: {
      "claude-code": { supported: true },
      cursor:        { supported: true,  note: "Available from v3.0+" },
      copilot:       { supported: false },
      codex:         { supported: false },
      opencode:      { supported: false },
      windsurf:      { supported: false },
      gemini:        { supported: false },
      junie:         { supported: false },
    },
  },

  // ── Runtime features ──────────────────────────────────────────────────────

  {
    id: "streaming-json",
    category: "runtime",
    label: "Streaming JSON output",
    description:
      "CLI emits NDJSON / stream-json so external tools can consume tokens " +
      "live without waiting for the full response.",
    added_at: "2025-09-01",
    support: {
      "claude-code": { supported: true },
      cursor:        { supported: false },
      copilot:       { supported: false },
      codex:         { supported: true },
      opencode:      { supported: true },
      windsurf:      { supported: false },
      gemini:        { supported: true },
      junie:         { supported: false },
    },
  },
  {
    id: "parallel-agents",
    category: "runtime",
    label: "Parallel agent execution",
    description:
      "Runtime supports spawning multiple independent agents to work on " +
      "separate tasks simultaneously within a single session.",
    added_at: "2026-04-15",
    support: {
      "claude-code": { supported: true },
      cursor:        { supported: true,  note: "v3.1+" },
      copilot:       { supported: false },
      codex:         { supported: false },
      opencode:      { supported: false },
      windsurf:      { supported: false },
      gemini:        { supported: false },
      junie:         { supported: false },
    },
  },

  // ── MCP protocols ─────────────────────────────────────────────────────────

  {
    id: "mcp-stdio",
    category: "protocol",
    label: "MCP · stdio",
    description:
      "MCP server runs as a subprocess communicating via stdin/stdout. The " +
      "simplest and most widely supported transport.",
    added_at: "2025-09-01",
    support: {
      "claude-code": { supported: true },
      cursor:        { supported: true },
      copilot:       { supported: true },
      codex:         { supported: true },
      opencode:      { supported: true },
      windsurf:      { supported: true },
      gemini:        { supported: true },
      junie:         { supported: true },
    },
  },
  {
    id: "mcp-http",
    category: "protocol",
    label: "MCP · HTTP",
    description:
      "MCP transport over HTTP — the server runs as a web service, queried " +
      "per-request.",
    added_at: "2026-04-08",
    support: {
      "claude-code": { supported: true },
      cursor:        { supported: true },
      copilot:       { supported: true },
      codex:         { supported: false },
      opencode:      { supported: true },
      windsurf:      { supported: false },
      gemini:        { supported: true },
      junie:         { supported: false },
    },
  },
  {
    id: "mcp-sse",
    category: "protocol",
    label: "MCP · SSE",
    description:
      "Server-Sent Events transport. Streams MCP events over a persistent " +
      "HTTP connection.",
    added_at: "2025-09-01",
    support: {
      "claude-code": { supported: true },
      cursor:        { supported: true },
      copilot:       { supported: false },
      codex:         { supported: false },
      opencode:      { supported: true },
      windsurf:      { supported: false },
      gemini:        { supported: false },
      junie:         { supported: false },
    },
  },
];

export const CATEGORY_LABELS: Record<CapabilityCategory, string> = {
  config:   "Config files",
  plugin:   "Plugin components",
  runtime:  "Runtime features",
  protocol: "MCP protocols",
};

export const CATEGORY_ORDER: CapabilityCategory[] = [
  "config",
  "plugin",
  "runtime",
  "protocol",
];

/** Returns true if this capability was added within the last N days. */
export function isNew(cap: Capability, withinDays = 7): boolean {
  const ms = Date.now() - new Date(cap.added_at).getTime();
  return ms < withinDays * 24 * 60 * 60 * 1000;
}
