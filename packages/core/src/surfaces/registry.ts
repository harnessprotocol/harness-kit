import { SURFACE_IDS } from "./types.js";
import type { SurfaceDescriptor, SurfaceId } from "./types.js";

/**
 * The Surface registry: pure per-surface path/binary/store metadata that keys
 * the cross-harness portability engine (design.md §2–3). This supersedes the
 * legacy compile-target metadata in adapters/target-metadata.ts (now also
 * keyed by `SurfaceId`); the capability matrix in portability/capabilities.ts
 * derives its cells for all 11 surfaces from this registry.
 *
 * Store paths are project-relative (scope "project") or home-relative
 * (scope "user"); `pathByPlatform` overrides `path` per OS. Paths verified
 * against each product's docs as of Aug 2026.
 *
 * The table is keyed by SurfaceId so that adding an id to SURFACE_IDS
 * without a registry entry fails to compile.
 */
const SURFACE_TABLE: Record<SurfaceId, Omit<SurfaceDescriptor, "id">> = {
  "claude-code": {
    label: "Claude Code",
    family: "claude",
    priority: true,
    requiredBinary: "claude",
    detect: [
      { scope: "project", path: ".claude" },
      { scope: "user", path: ".claude" },
    ],
    stores: [
      { kind: "mcp-server", scope: "user", formatId: "json-mcpservers", path: ".claude.json" },
      { kind: "permissions", scope: "user", formatId: "json-generic", path: ".claude/settings.json" },
      { kind: "skill", scope: "user", formatId: "skills-dir", path: ".claude/skills" },
      { kind: "instructions", scope: "user", formatId: "markdown-instructions", path: ".claude/CLAUDE.md" },
      { kind: "mcp-server", scope: "project", formatId: "json-mcpservers", path: ".mcp.json" },
      { kind: "permissions", scope: "project", formatId: "json-generic", path: ".claude/settings.json" },
      { kind: "skill", scope: "project", formatId: "skills-dir", path: ".claude/skills" },
      { kind: "instructions", scope: "project", formatId: "markdown-instructions", path: "CLAUDE.md" },
      // One user-scoped file records BOTH scopes: project-local installs are
      // entries carrying a projectPath. The codec stamps each entry's own
      // scope and filters project installs to the observed project root, so
      // this store is declared once, at user scope, not twice.
      {
        kind: "plugin",
        scope: "user",
        formatId: "json-claude-plugins",
        path: ".claude/plugins/installed_plugins.json",
        // `claude plugin enable/disable` writes `enabledPlugins` into
        // settings, not into the install record, so enablement is read from
        // there. Order is precedence, verified against `claude plugin list`
        // with an isolated CLAUDE_CONFIG_DIR: the PROJECT files override the
        // user file (and do so for user-scope installs too), while
        // `~/.claude/settings.local.json` is NOT consulted at all — a `true`
        // there does not override a `false` in `~/.claude/settings.json`.
        // Managed/enterprise settings are out of scope.
        enablement: [
          { scope: "user", path: ".claude/settings.json" },
          { scope: "project", path: ".claude/settings.json" },
          { scope: "project", path: ".claude/settings.local.json" },
        ],
      },
    ],
    notApplicable: [],
    marketplaces: [
      { scope: "user", formatId: "json-claude-marketplaces", path: ".claude/plugins/known_marketplaces.json" },
    ],
  },
  "claude-desktop": {
    label: "Claude Desktop",
    family: "claude",
    priority: true,
    detect: [
      {
        scope: "user",
        path: "Library/Application Support/Claude/claude_desktop_config.json",
        pathByPlatform: {
          darwin: "Library/Application Support/Claude/claude_desktop_config.json",
          win32: "AppData/Roaming/Claude/claude_desktop_config.json",
        },
      },
    ],
    stores: [
      {
        kind: "mcp-server",
        scope: "user",
        formatId: "json-mcpservers",
        path: "Library/Application Support/Claude/claude_desktop_config.json",
        pathByPlatform: {
          darwin: "Library/Application Support/Claude/claude_desktop_config.json",
          win32: "AppData/Roaming/Claude/claude_desktop_config.json",
        },
      },
    ],
    notApplicable: ["plugin", "permissions"],
  },
  "copilot-vscode": {
    label: "GitHub Copilot (VS Code)",
    family: "copilot",
    priority: true,
    requiredBinary: "code",
    detect: [
      { scope: "project", path: ".github/copilot-instructions.md" },
      { scope: "project", path: ".vscode/mcp.json" },
      {
        scope: "user",
        path: "Library/Application Support/Code/User/mcp.json",
        pathByPlatform: {
          darwin: "Library/Application Support/Code/User/mcp.json",
          linux: ".config/Code/User/mcp.json",
          win32: "AppData/Roaming/Code/User/mcp.json",
        },
      },
    ],
    stores: [
      {
        kind: "mcp-server",
        scope: "project",
        formatId: "json-mcpservers",
        path: ".vscode/mcp.json",
        shape: { rootKey: "servers" },
      },
      { kind: "instructions", scope: "project", formatId: "markdown-instructions", path: ".github/copilot-instructions.md" },
      { kind: "skill", scope: "project", formatId: "skills-dir", path: ".github/skills" },
      {
        kind: "mcp-server",
        scope: "user",
        formatId: "json-mcpservers",
        path: "Library/Application Support/Code/User/mcp.json",
        pathByPlatform: {
          darwin: "Library/Application Support/Code/User/mcp.json",
          linux: ".config/Code/User/mcp.json",
          win32: "AppData/Roaming/Code/User/mcp.json",
        },
        shape: { rootKey: "servers" },
        // VS Code profiles keep per-profile copies of User/ — inventory from
        // the default profile dir may be incomplete.
        needsConfirmation: true,
      },
    ],
    notApplicable: [],
  },
  "copilot-cli": {
    label: "GitHub Copilot CLI",
    family: "copilot",
    priority: true,
    requiredBinary: "copilot",
    detect: [{ scope: "user", path: ".copilot" }],
    stores: [
      { kind: "mcp-server", scope: "user", formatId: "json-mcpservers", path: ".copilot/mcp-config.json" },
      { kind: "permissions", scope: "user", formatId: "json-generic", path: ".copilot/settings.json" },
      { kind: "skill", scope: "user", formatId: "skills-dir", path: ".copilot/skills" },
      { kind: "instructions", scope: "user", formatId: "markdown-instructions", path: ".copilot/copilot-instructions.md" },
      { kind: "permissions", scope: "project", formatId: "json-generic", path: ".github/copilot/settings.json" },
      { kind: "skill", scope: "project", formatId: "skills-dir", path: ".github/skills" },
      { kind: "instructions", scope: "project", formatId: "markdown-instructions", path: "AGENTS.md" },
    ],
    notApplicable: [],
  },
  codex: {
    label: "OpenAI Codex",
    family: "codex",
    priority: true,
    requiredBinary: "codex",
    // One surface: the ChatGPT desktop app, Codex CLI, and Codex IDE
    // extension all read the same ~/.codex/config.toml.
    mergedClients: ["chatgpt-desktop", "codex-cli", "codex-ide"],
    detect: [
      { scope: "user", path: ".codex" },
      { scope: "project", path: ".codex" },
    ],
    stores: [
      { kind: "mcp-server", scope: "user", formatId: "toml-codex", path: ".codex/config.toml" },
      { kind: "instructions", scope: "user", formatId: "markdown-instructions", path: ".codex/AGENTS.md" },
      { kind: "skill", scope: "user", formatId: "skills-dir", path: ".agents/skills" },
      { kind: "mcp-server", scope: "project", formatId: "toml-codex", path: ".codex/config.toml" },
      { kind: "instructions", scope: "project", formatId: "markdown-instructions", path: "AGENTS.md" },
      { kind: "skill", scope: "project", formatId: "skills-dir", path: ".agents/skills" },
      { kind: "plugin", scope: "user", formatId: "toml-codex-plugins", path: ".codex/config.toml" },
      { kind: "plugin", scope: "project", formatId: "toml-codex-plugins", path: ".codex/config.toml" },
    ],
    notApplicable: [],
    marketplaces: [
      { scope: "user", formatId: "toml-codex-marketplaces", path: ".codex/config.toml" },
      { scope: "project", formatId: "toml-codex-marketplaces", path: ".codex/config.toml" },
    ],
  },
  cursor: {
    label: "Cursor",
    family: "cursor",
    priority: true,
    requiredBinary: "cursor-agent",
    detect: [
      { scope: "project", path: ".cursor" },
      { scope: "user", path: ".cursor" },
    ],
    stores: [
      { kind: "mcp-server", scope: "user", formatId: "json-mcpservers", path: ".cursor/mcp.json" },
      { kind: "skill", scope: "user", formatId: "skills-dir", path: ".cursor/skills" },
      { kind: "skill", scope: "user", formatId: "skills-dir", path: ".agents/skills" },
      { kind: "permissions", scope: "user", formatId: "json-generic", path: ".cursor/cli-config.json" },
      { kind: "mcp-server", scope: "project", formatId: "json-mcpservers", path: ".cursor/mcp.json" },
      {
        kind: "instructions",
        scope: "project",
        formatId: "markdown-instructions",
        // A directory of .mdc rule files, not a single markdown file.
        path: ".cursor/rules",
        shape: { directory: true },
      },
      { kind: "skill", scope: "project", formatId: "skills-dir", path: ".cursor/skills" },
    ],
    notApplicable: [],
  },
  pi: {
    label: "pi",
    family: "pi",
    priority: true,
    requiredBinary: "pi",
    detect: [
      { scope: "project", path: ".pi" },
      { scope: "user", path: ".pi" },
    ],
    stores: [
      { kind: "permissions", scope: "user", formatId: "json-generic", path: ".pi/agent/settings.json" },
      { kind: "skill", scope: "user", formatId: "skills-dir", path: ".pi/agent/skills" },
      { kind: "instructions", scope: "user", formatId: "markdown-instructions", path: ".pi/agent/APPEND_SYSTEM.md" },
      { kind: "instructions", scope: "user", formatId: "markdown-instructions", path: ".pi/agent/AGENTS.md" },
      { kind: "permissions", scope: "project", formatId: "json-generic", path: ".pi/settings.json" },
      { kind: "skill", scope: "project", formatId: "skills-dir", path: ".pi/skills" },
      { kind: "instructions", scope: "project", formatId: "markdown-instructions", path: ".pi/APPEND_SYSTEM.md" },
    ],
    notApplicable: ["mcp-server", "plugin"],
  },
  opencode: {
    label: "OpenCode",
    family: "opencode",
    priority: true,
    detect: [
      { scope: "project", path: "opencode.json" },
      { scope: "user", path: ".config/opencode" },
    ],
    stores: [
      { kind: "mcp-server", scope: "user", formatId: "json-opencode", path: ".config/opencode/opencode.json" },
      { kind: "skill", scope: "user", formatId: "skills-dir", path: ".config/opencode/skills" },
      { kind: "instructions", scope: "user", formatId: "markdown-instructions", path: ".config/opencode/AGENTS.md" },
      { kind: "mcp-server", scope: "project", formatId: "json-opencode", path: "opencode.json" },
      { kind: "skill", scope: "project", formatId: "skills-dir", path: ".opencode/skills" },
      { kind: "instructions", scope: "project", formatId: "markdown-instructions", path: "AGENTS.md" },
    ],
    notApplicable: [],
  },
  // ── Legacy surfaces retained at current fidelity (data carried over ──
  // from adapters/target-metadata.ts TARGETS).
  windsurf: {
    label: "Windsurf",
    family: "windsurf",
    priority: false,
    detect: [{ scope: "project", path: ".windsurf" }],
    stores: [
      { kind: "skill", scope: "project", formatId: "skills-dir", path: ".windsurf/skills" },
      { kind: "skill", scope: "user", formatId: "skills-dir", path: ".windsurf/skills" },
      { kind: "instructions", scope: "project", formatId: "markdown-instructions", path: "AGENTS.md" },
      // Windsurf MCP config is global-only (~/.codeium/windsurf/mcp_config.json);
      // no project-level MCP store, matching target-metadata.ts.
    ],
    notApplicable: [],
  },
  gemini: {
    label: "Gemini CLI",
    family: "gemini",
    priority: false,
    requiredBinary: "gemini",
    detect: [{ scope: "project", path: ".gemini" }],
    stores: [
      { kind: "skill", scope: "project", formatId: "skills-dir", path: ".gemini/skills" },
      { kind: "skill", scope: "user", formatId: "skills-dir", path: ".gemini/skills" },
      { kind: "instructions", scope: "project", formatId: "markdown-instructions", path: "AGENTS.md" },
      { kind: "mcp-server", scope: "project", formatId: "json-mcpservers", path: ".gemini/settings.json" },
    ],
    notApplicable: [],
  },
  junie: {
    label: "Junie",
    family: "junie",
    priority: false,
    requiredBinary: "junie",
    detect: [{ scope: "project", path: ".junie" }],
    stores: [
      { kind: "skill", scope: "project", formatId: "skills-dir", path: ".junie/skills" },
      { kind: "skill", scope: "user", formatId: "skills-dir", path: ".junie/skills" },
      { kind: "instructions", scope: "project", formatId: "markdown-instructions", path: "AGENTS.md" },
      { kind: "mcp-server", scope: "project", formatId: "json-mcpservers", path: ".junie/mcp/mcp.json" },
    ],
    notApplicable: [],
  },
};

/** All supported surfaces, in SURFACE_IDS order. */
export const SURFACES: SurfaceDescriptor[] = SURFACE_IDS.map((id) => ({
  id,
  ...SURFACE_TABLE[id],
}));

/** Ids of the surfaces the engine actively targets (legacy surfaces excluded). */
export const PRIORITY_SURFACES: SurfaceId[] = SURFACES.filter((s) => s.priority).map(
  (s) => s.id,
);

export function getSurface(id: SurfaceId): SurfaceDescriptor {
  const surface = SURFACES.find((s) => s.id === id);
  if (!surface) {
    const valid = SURFACES.map((s) => s.id).join(", ");
    throw new Error(`Unknown surface: ${id}. Valid surface ids: ${valid}`);
  }
  return surface;
}
