import type { TargetPlatform } from "../types.js";

export interface IntegrationTarget {
  id: TargetPlatform;
  label: string;
  /** CLI binary to check for tool availability (used by `harness doctor`). */
  requiredBinary?: string;
  /** Project-relative skills directory. null = uses plugin install system (claude-code). */
  skillsDir: string | null;
  /** flat = skills/name/  nested = skills/owner/repo/name/ */
  layout: "flat" | "nested";
  /** Primary instruction file for this tool. */
  instructionFile: string | null;
  /** Project-level MCP config file. null = global-only or not applicable. */
  mcpConfigFile: string | null;
  mcpConfigFormat: "json" | "toml" | null;
  /**
   * Tool reads skillsDir natively — no special deploy step needed beyond writing the file.
   * For tools that resolve skills directly from the directory rather than via install commands.
   */
  skillsReadDirect?: true;
}

export const TARGETS: IntegrationTarget[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    requiredBinary: "claude",
    skillsDir: null,
    layout: "flat",
    instructionFile: "CLAUDE.md",
    mcpConfigFile: ".mcp.json",
    mcpConfigFormat: "json",
  },
  {
    id: "cursor",
    label: "Cursor",
    requiredBinary: "cursor-agent",
    skillsDir: ".cursor/skills",
    layout: "nested",
    instructionFile: ".cursor/rules/harness.mdc",
    mcpConfigFile: ".cursor/mcp.json",
    mcpConfigFormat: "json",
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    requiredBinary: "code",
    skillsDir: ".github/skills",
    layout: "flat",
    instructionFile: ".github/copilot-instructions.md",
    mcpConfigFile: ".vscode/mcp.json",
    mcpConfigFormat: "json",
  },
  {
    id: "codex",
    label: "OpenAI Codex",
    requiredBinary: "codex",
    skillsDir: ".agents/skills",
    layout: "flat",
    instructionFile: "AGENTS.md",
    mcpConfigFile: ".codex/config.toml",
    mcpConfigFormat: "toml",
    skillsReadDirect: true,
  },
  {
    id: "opencode",
    label: "OpenCode",
    skillsDir: ".opencode/skills",
    layout: "flat",
    instructionFile: "AGENTS.md",
    mcpConfigFile: "opencode.json",
    mcpConfigFormat: "json",
  },
  {
    id: "windsurf",
    label: "Windsurf",
    skillsDir: ".windsurf/skills",
    layout: "flat",
    instructionFile: "AGENTS.md",
    // Windsurf MCP config is global (~/.codeium/windsurf/mcp_config.json).
    // The compiler only writes project-level files, so MCP is skipped for Windsurf.
    mcpConfigFile: null,
    mcpConfigFormat: null,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    requiredBinary: "gemini",
    skillsDir: ".gemini/skills",
    layout: "flat",
    instructionFile: "AGENTS.md",
    mcpConfigFile: ".gemini/settings.json",
    mcpConfigFormat: "json",
  },
  {
    id: "junie",
    label: "Junie",
    requiredBinary: "junie",
    skillsDir: ".junie/skills",
    layout: "flat",
    instructionFile: "AGENTS.md",
    mcpConfigFile: ".junie/mcp/mcp.json",
    mcpConfigFormat: "json",
  },
];

export function getTarget(id: TargetPlatform): IntegrationTarget {
  const t = TARGETS.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown target: ${id}`);
  return t;
}

/** All targets that share AGENTS.md as their instruction file. */
export const AGENTS_MD_TARGETS: TargetPlatform[] = TARGETS
  .filter((t) => t.instructionFile === "AGENTS.md")
  .map((t) => t.id);
