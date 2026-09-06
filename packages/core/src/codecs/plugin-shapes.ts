/**
 * Value shapes shared by every plugin/marketplace codec (AC-4).
 *
 * Surfaces record wildly different amounts about an installed plugin —
 * Claude Code stores a version, a commit and timestamps; Codex stores a
 * single `enabled` flag — so the shared shape is the intersection that is
 * actually comparable across surfaces, with the richer fields optional.
 * Codecs live beside the format they read (`json-claude-plugins.ts`,
 * `toml-codex.ts`) and map into these types; `observe/read-store.ts`
 * consumes them without knowing which surface produced them.
 */

/** Which scope one install entry belongs to. */
export type PluginInstallScope = "user" | "project";

/** One plugin install, as observed. */
export interface PluginStoreValue {
  /** Marketplace id — the `@suffix` of the identity key. */
  marketplace: string;
  /** Plugin name — the part before the `@`. */
  name: string;
  /** Whether the surface reports this install as active. */
  enabled: boolean;
  /**
   * Version the surface recorded, when it records one. Deliberately OUTSIDE
   * the canonical form (observe/normalize.ts): Codex records no version at
   * all, so digesting it would make every claude-code↔codex plugin row a
   * permanent false diff. Version drift is a recommendation signal, computed
   * only between surfaces that both report one.
   */
  version?: string;
  /** Commit the install was resolved to, when the surface records one. */
  revision?: string;
}

/** One registered plugin marketplace, as observed. */
export interface MarketplaceValue {
  /** Marketplace id — the `@suffix` plugin identities refer to. */
  id: string;
  /** How the surface fetches it (`github`, `git`, `local`, …), when recorded. */
  sourceType?: string;
  /**
   * Where it comes from: a repo slug, a URL, or a filesystem path.
   *
   * Local paths are home-relativized (`~/…`) by `observe/read-store.ts`
   * before they leave the read layer. Codex genuinely writes absolute
   * bundled-marketplace paths under the user's home, and a raw
   * `/Users/<name>/…` would carry the machine owner's username into
   * inventory output, grid state, and anything exported from it.
   */
  source?: string;
}
