import type { FsProvider } from "../fs-provider.js";
import type {
  DetectedPlatform,
  FileAction,
  HarnessConfig,
  TargetPlatform as CompileTargetPlatform,
} from "../types.js";
import type { ImportedFragment as ImportedFragmentType } from "../import/types.js";

// ── Adapter identity ──────────────────────────────────────────
//
// This is a DIFFERENT, coarser enum than `TargetPlatform` in ../types.ts.
// `TargetPlatform` (8 values: claude-code, cursor, copilot, codex, opencode,
// windsurf, gemini, junie) identifies a per-tool COMPILE TARGET and is left
// completely unchanged by this refactor — it is load-bearing for the existing
// CLI/desktop surface and the compile pipeline's file-path maps.
//
// `AdapterId` identifies a per-ADAPTER module. Several legacy `TargetPlatform`
// values that all consume the shared AGENTS.md convention (codex, windsurf,
// gemini, junie) are served by a single `agents-md` adapter with per-tool path
// variants. `pi` is sized into the enum now for a future WP; no adapter exists
// for it yet.
export type AdapterId =
  | "claude-code"
  | "cursor"
  | "copilot"
  | "opencode"
  | "pi"
  | "agents-md";

/** Re-exported for adapter authors — the legacy per-tool target id. */
export type { CompileTargetPlatform };

// ── Capability model ──────────────────────────────────────────

export type HarnessDomain =
  | "instructions"
  | "skills"
  | "subagents"
  | "mcp"
  | "permissions"
  | "hooks"
  | "model";

export type FeatureSupport = "full" | "partial" | "none";

export interface AdapterCapabilities {
  /** What this adapter can currently WRITE (harness.yaml → tool config), per domain. */
  export: Record<HarnessDomain, FeatureSupport>;
  /** What this adapter can currently READ BACK (tool config → harness.yaml), per domain. Bodies land in WP-2.2; all "none" for now. */
  import: Record<HarnessDomain, FeatureSupport>;
  /** Whether this adapter can produce a DriftReport via diff(). Stub-only this WP. */
  diff: boolean;
  /** Which installation scopes this adapter's exportConfig currently writes to. */
  scopes: ("project" | "global")[];
}

// ── Adapter context ───────────────────────────────────────────
//
// Threads the existing FsProvider + root paths plumbing. No new fs layer.

export interface AdapterContext {
  fs: FsProvider;
  /** Project root — same value as fs.cwd(); carried explicitly for clarity at call sites. */
  projectRoot: string;
  /** Absolute path to the user's home directory (for global-scope reads/writes). */
  homeRoot: string;
  /**
   * For adapters that internally cover more than one legacy `TargetPlatform`
   * (i.e. `agents-md`, which spans codex/opencode/windsurf/gemini/junie):
   * restricts exportConfig to only this subset of its covered legacy targets.
   * Omit to compile for the adapter's full covered family (the default when
   * an adapter is invoked standalone, outside compile.ts's orchestration).
   */
  legacyTargets?: CompileTargetPlatform[];
}

// ── Result types for future (WP-2.2+) methods ────────────────
//
// Bodies are NOT implemented in this WP. Types exist now so the interface
// shape is load-bearing and later WPs only need to fill in function bodies.

/** Wraps compile.ts's existing file-write plan — does not duplicate it. */
export interface FilePlan {
  files: FileAction[];
  warnings: string[];
  skippedPlugins: string[];
}

export type DetectResult = DetectedPlatform;

/**
 * A fragment of harness.yaml reconstructed by reading a tool's native config.
 *
 * WP-2.2 fleshes this out for real: the full, provenance-carrying shape lives
 * in `../import/types.js` (re-exported here) rather than being redefined —
 * every imported value carries `{ value, source: { adapter, file, span? } }`,
 * and free-form prose becomes an opaque instruction block, never parsed
 * fields. `config: Partial<HarnessConfig>` is retained on the type for
 * backward shape-compatibility but importers leave it empty — the typed
 * side-channels (`instructions`/`mcpServers`/`permissions`/`skills`) are what
 * the synthesizer (`../import/synthesize.js`) actually consumes.
 */
export type { ImportedFragment } from "../import/types.js";

/** One divergence between harness.yaml and what's actually deployed for a domain. Body: WP-2.2. */
export interface DriftEntry {
  domain: HarnessDomain;
  path: string;
  status: "ok" | "drift" | "missing";
  detail?: string;
}

/** Body: WP-2.2. */
export interface DriftReport {
  adapter: AdapterId;
  entries: DriftEntry[];
  hasDrift: boolean;
}

// ── The adapter interface ─────────────────────────────────────

export interface HarnessAdapter {
  id: AdapterId;
  capabilities: AdapterCapabilities;

  /** Detect whether this tool is in use in the current project. */
  detect(ctx: AdapterContext): Promise<DetectResult | null>;

  /**
   * The refactored current compile logic for this adapter's target(s) —
   * REQUIRED, real. Must delegate to the same shared services
   * (instructions.ts, mcp-servers.ts, skills.ts, permissions.ts, markers.ts,
   * discovery.ts) that the pre-refactor compiler used — same emit logic,
   * same bytes.
   */
  exportConfig(config: HarnessConfig, ctx: AdapterContext): Promise<FilePlan>;

  /**
   * Reverse-import: tool config → harness.yaml fragments (WP-2.2). One
   * adapter can cover several domains at once (e.g. claude-code reads
   * instructions + permissions + mcp in one pass), so this returns an array —
   * zero or more fragments, one per domain actually found. Omitted entirely
   * on adapters with nothing importable.
   */
  importConfig?(ctx: AdapterContext): Promise<ImportedFragmentType[]>;

  /** Drift detection: harness.yaml vs deployed tool config. Stub/omitted this WP — bodies land in WP-2.2. */
  diff?(config: HarnessConfig, ctx: AdapterContext): Promise<DriftReport>;
}

// ── Shared helper: build a "domain has content but adapter can't export it" warning ──

export function domainSkippedWarning(
  adapterId: AdapterId,
  domain: HarnessDomain,
  detail: string,
): string {
  return `[${adapterId}] domain '${domain}' is not exported by this adapter (capabilities.export.${domain} = "none") — skipped. ${detail}`;
}
