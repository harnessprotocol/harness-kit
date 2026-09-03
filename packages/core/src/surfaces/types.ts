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

/**
 * Surfaces with a compile adapter today — the legacy compile-target set.
 * Maps keyed `Record<CompileSurfaceId, ...>` regain compile-time
 * exhaustiveness over exactly this set: adding an id here without extending
 * every such map fails to compile. Tasks 6–8 extend it as new surfaces
 * (claude-desktop, copilot-cli, pi) gain adapters.
 */
export const COMPILE_SURFACE_IDS = [
  "claude-code",
  "cursor",
  "copilot-vscode",
  "codex",
  "opencode",
  "windsurf",
  "gemini",
  "junie",
] as const;

export type CompileSurfaceId = (typeof COMPILE_SURFACE_IDS)[number];

/** Narrowing guard: whether `id` has a compile adapter today. */
export function isCompileSurface(id: SurfaceId): id is CompileSurfaceId {
  return (COMPILE_SURFACE_IDS as readonly SurfaceId[]).includes(id);
}

/** The harness products surfaces belong to (multiple surfaces may share one). */
export const PRODUCT_FAMILIES = [
  "claude", "copilot", "codex", "cursor", "pi", "opencode",
  "windsurf", "gemini", "junie",
] as const;

/** The harness product a surface belongs to (multiple surfaces may share one). */
export type ProductFamily = (typeof PRODUCT_FAMILIES)[number];

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
  | "markdown-instructions" // one markdown file; with shape.directory, every *.md/*.mdc in the dir
  | "json-claude-plugins"  // code codec (Claude Code installed_plugins.json)
  | "toml-codex-plugins";  // code codec ([plugins."name@marketplace"] in config.toml)

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

/**
 * Formats recording a surface's *registered plugin marketplaces* (AC-4).
 * Marketplaces are not a `HarnessResourceKind` — they are where plugins come
 * from, not configuration a user holds — so they travel beside the resource
 * pipeline rather than through it.
 */
export type MarketplaceFormatId =
  | "json-claude-marketplaces" // Claude Code known_marketplaces.json
  | "toml-codex-marketplaces"; // [marketplaces.ID] in ~/.codex/config.toml

/** One file a surface records its registered plugin marketplaces in. */
export interface MarketplaceStore {
  scope: SurfaceScope;
  formatId: MarketplaceFormatId;
  /**
   * Project-relative (scope "project") or home-relative (scope "user") path.
   * Holds the darwin/default value; a matching pathByPlatform entry wins.
   */
  path: string;
  /** Per-OS overrides: the current platform's entry wins; a missing key falls back to `path`. */
  pathByPlatform?: PlatformPathOverrides;
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
  /**
   * Where this surface records its registered plugin marketplaces (AC-4).
   * Absent means HarnessKit cannot enumerate this surface's marketplaces —
   * which is NOT the same as the surface having no plugin model. Read it
   * together with `notApplicable`: `plugin` listed there means the harness
   * has no plugin concept at all; `plugin` absent from both `stores` and
   * `notApplicable` means it has one HarnessKit does not yet read locally.
   */
  marketplaces?: MarketplaceStore[];
  /** Distinct clients sharing this surface's config store. */
  mergedClients?: string[];
}
