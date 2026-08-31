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
export type SurfaceId =
  | "claude-code" | "claude-desktop" | "copilot-vscode" | "copilot-cli"
  | "codex" | "cursor" | "pi" | "opencode"
  | "windsurf" | "gemini" | "junie";

/** The harness product a surface belongs to (multiple surfaces may share one). */
export type ProductFamily =
  | "claude" | "copilot" | "codex" | "cursor" | "pi" | "opencode"
  | "windsurf" | "gemini" | "junie";

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
  | "markdown-instructions";

/** One config file or directory a surface reads a resource kind from. */
export interface ConfigStore {
  kind: HarnessResourceKind;
  scope: SurfaceScope;
  formatId: StoreFormatId;
  /** Project-relative (scope "project") or home-relative (scope "user") path; pathByPlatform wins. */
  path: string;
  pathByPlatform?: Partial<Record<"darwin" | "win32" | "linux", string>>;
  shape?: { rootKey?: string };
  /** Inventory from this store may be incomplete or ambiguous (e.g. VS Code profile dirs). */
  needsConfirmation?: boolean;
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
  detect: Array<{ scope: SurfaceScope; path: string }>;
  stores: ConfigStore[];
  /** Resource kinds this harness has no concept of. */
  notApplicable: HarnessResourceKind[];
  /** Distinct clients sharing this surface's config store. */
  mergedClients?: string[];
}
