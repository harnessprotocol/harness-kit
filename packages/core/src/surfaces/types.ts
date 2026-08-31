import type { HarnessResourceKind } from "../portability/types.js";

/**
 * Surface model (design.md §2, D1).
 *
 * A surface is one installation form of a harness with its own config store —
 * Claude Code and Claude Desktop are different surfaces of the same product,
 * while the ChatGPT desktop app, Codex CLI, and Codex IDE extension are one
 * surface (they share `~/.codex/config.toml`). Surfaces are the unit of
 * comparison: each surface gets its own column in the machine grid.
 */
export const SURFACE_IDS = [
  "claude-code",
  "claude-desktop",
  "copilot-vscode",
  "copilot-cli",
  "codex",
  "cursor",
  "pi",
  "opencode",
  "windsurf",
  "gemini",
  "junie",
] as const;

export type SurfaceId = (typeof SURFACE_IDS)[number];

/** The harness product a surface belongs to (multiple surfaces may share one). */
export type ProductFamily =
  | "claude" | "copilot" | "codex" | "cursor" | "pi" | "opencode"
  | "windsurf" | "gemini" | "junie";

/** Note: "user" corresponds to "personal" in the portability layer vocabulary (HarnessScope). */
export type SurfaceScope = "user" | "project";

/**
 * Format families handled by generic executors, plus irregular formats that
 * implement a code codec (design.md §3, D2).
 */
export type StoreFormatId =
  | "json-mcpservers"      // { mcpServers: {...} } and variants via shape.rootKey
  | "json-generic"         // settings-style JSON
  | "toml-codex"           // code codec (read-only for now)
  | "json-opencode"        // code codec (merged opencode.json)
  | "skills-dir"           // SKILL.md tree
  | "markdown-instructions"; // one markdown file; with shape.directory, every *.md/*.mdc in the dir

/**
 * Per-OS path overrides. The entry for the current platform wins; a missing
 * key falls back to the accompanying `path` field, which holds the
 * darwin/default value.
 */
export type PlatformPathOverrides = Partial<Record<"darwin" | "win32" | "linux", string>>;

/** One config file or directory a surface reads a resource kind from. */
export interface ConfigStore {
  kind: HarnessResourceKind;
  scope: SurfaceScope;
  formatId: StoreFormatId;
  /**
   * Project-relative (scope "project") or home-relative (scope "user") path.
   * Holds the darwin/default value; a matching pathByPlatform entry wins.
   */
  path: string;
  /** Per-OS overrides: the current platform's entry wins; a missing key falls back to `path`. */
  pathByPlatform?: PlatformPathOverrides;
  shape?: {
    /** Root object key holding the server map (default "mcpServers"). */
    rootKey?: string;
    /**
     * The path is a directory of instruction files (*.md/*.mdc), not a single
     * file — e.g. Cursor's .cursor/rules. Executor support lands separately.
     */
    directory?: true;
  };
  /** Inventory from this store may be incomplete or ambiguous (e.g. VS Code profile dirs). */
  needsConfirmation?: boolean;
}

/** Detection probe: the probe path existing on disk ⇒ surface detected. */
export interface DetectProbe {
  scope: SurfaceScope;
  /** Holds the darwin/default value; a matching pathByPlatform entry wins. */
  path: string;
  /** Per-OS overrides: the current platform's entry wins; a missing key falls back to `path`. */
  pathByPlatform?: PlatformPathOverrides;
}

/** Pure-data description of one surface (compiled into the definitions bundle). */
export interface SurfaceDescriptor {
  id: SurfaceId;
  label: string;
  family: ProductFamily;
  priority: boolean;
  /** CLI binary probed for tool availability (used by `harness doctor`). */
  requiredBinary?: string;
  /** Detection probes: any listed path existing ⇒ surface detected. */
  detect: DetectProbe[];
  stores: ConfigStore[];
  /**
   * Resource kinds this harness has no concept of. Three-state semantics per
   * kind: listed in `stores` = managed here; listed in `notApplicable` = the
   * harness lacks the concept entirely; in neither = the harness has the
   * concept but no locally managed store, so the grid cell renders
   * "unmanaged locally" (e.g. claude-desktop skills, which are cloud-side).
   */
  notApplicable: HarnessResourceKind[];
  /** Distinct clients sharing this surface's config store. */
  mergedClients?: string[];
}
