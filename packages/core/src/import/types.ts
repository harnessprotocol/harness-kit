import type { AdapterId, HarnessDomain } from "../adapters/adapter.js";
import type { HarnessConfig, McpServer, HarnessPermissions } from "../types.js";

// ── Provenance ──────────────────────────────────────────────────
//
// Every value imported from a native tool config carries a pointer back to
// where it came from. Provenance is never optional — an imported field with
// no provenance is a bug, not an edge case.

export interface ImportSource {
  adapter: AdapterId;
  /** Project-relative (or ~-prefixed for home-scoped) path to the source file. */
  file: string;
  /** Optional line range within the file, 1-indexed, inclusive. */
  span?: { startLine: number; endLine: number };
}

/** A single value plus where it came from. */
export interface Provenance<T> {
  value: T;
  source: ImportSource;
}

// ── Opaque instruction blocks ─────────────────────────────────────
//
// Free-form instruction prose is NEVER parsed into structured fields. It is
// preserved verbatim as an opaque block with a source pointer. Never
// paraphrased, summarized, or reformatted — see CLAUDE.md boundaries.

export interface OpaqueInstructionBlock {
  /** Which instruction slot this text is destined for on export. */
  slot: "operational" | "behavioral" | "identity";
  /** Verbatim source text — byte-for-byte, no transformation. */
  text: string;
  source: ImportSource;
}

// ── Imported fragment (per adapter) ──────────────────────────────
//
// Fleshed-out replacement for the WP-2.1 stub `ImportedFragment`. Each
// adapter's importConfig() returns one of these per domain it can read back,
// carrying provenance on every field rather than a bare Partial<HarnessConfig>.

export interface ImportedInstructions {
  /** Opaque blocks discovered for this adapter, one per instruction file/slot. */
  blocks: OpaqueInstructionBlock[];
}

export interface ImportedMcpServers {
  servers: Record<string, Provenance<McpServer>>;
}

export interface ImportedPermissions {
  /** Permissions is a single composite value — one provenance record for the whole thing. */
  value: Provenance<HarnessPermissions>;
}

export interface ImportedSkillRef {
  name: string;
  /** Path to the discovered SKILL.md, relative to project root. */
  path: string;
  source: ImportSource;
}

/**
 * Reserved for a future WP: no adapter currently sets capabilities.import.skills
 * to anything but "none" (see each adapter's index.ts), because a deployed
 * SKILL.md on disk cannot be reliably mapped back to the `plugins[].source`
 * harness.yaml needs (the source registry/repo isn't recoverable from the
 * deployed file alone). The shape is typed now, unused today, so a future WP
 * only needs to populate it — same load-bearing-stub pattern WP-2.1 used for
 * `DriftReport`.
 */
export interface ImportedSkills {
  skills: ImportedSkillRef[];
}

/**
 * One domain's worth of imported content from one adapter. Superset of the
 * WP-2.1 stub — `config` is kept for backward shape-compatibility with the
 * adapter.ts stub type but the rich, provenance-carrying data lives in the
 * typed side-channels below (instructions/mcpServers/permissions/skills),
 * which the synthesizer actually consumes.
 */
export interface ImportedFragment {
  domain: HarnessDomain;
  /** Kept empty/unused by the synthesizer — never populated with parsed prose. */
  config: Partial<HarnessConfig>;
  warnings: string[];
  instructions?: ImportedInstructions;
  mcpServers?: ImportedMcpServers;
  permissions?: ImportedPermissions;
  /** Unused by any adapter this WP — see ImportedSkills doc comment. */
  skills?: ImportedSkills;
  /** Things this adapter looked for but explicitly could not import, with why. */
  skipped?: Array<{ file: string; reason: string }>;
}

// ── Per-adapter import result (what importProject collects) ─────

export interface AdapterImportResult {
  adapter: AdapterId;
  detected: boolean;
  fragments: ImportedFragment[];
  warnings: string[];
}

// ── Findings summary (for CLI/desktop rendering) ─────────────────

export interface AdapterFindingsSummary {
  adapter: AdapterId;
  detected: boolean;
  /** Human-readable one-line-per-artifact summary of what was found where. */
  found: Array<{ domain: string; file: string; detail: string }>;
  skipped: Array<{ file: string; reason: string }>;
  warnings: string[];
}

export interface ImportFindings {
  adapters: AdapterFindingsSummary[];
}

// ── Synthesizer output ───────────────────────────────────────────

/** One field where two+ adapters disagreed — recorded, never silently picked. */
export interface ImportConflict {
  field: string;
  alternates: Array<{ adapter: AdapterId; value: unknown; source: ImportSource }>;
}

export interface ImportProvenanceMap {
  /** Flattened list of every field that made it into harnessYaml, with source. */
  entries: Array<{ field: string; source: ImportSource }>;
  conflicts: ImportConflict[];
}

export interface ImportProjectResult {
  harnessYaml: string;
  harnessConfig: HarnessConfig;
  findings: ImportFindings;
  provenance: ImportProvenanceMap;
}
