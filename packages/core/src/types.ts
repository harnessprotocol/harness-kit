// ── Target platforms ─────────────────────────────────────────

export type TargetPlatform =
  | "claude-code"
  | "cursor"
  | "copilot"
  | "codex"
  | "opencode"
  | "windsurf"
  | "gemini"
  | "junie";

// ── Harness config (parsed harness.yaml) ─────────────────────

export interface HarnessMetadata {
  name: string;
  description: string;
  author?: { name: string; url?: string };
  version?: string;
  license?: string;
  tags?: string[];
}

/**
 * Plugin name, optionally scoped to an organization namespace.
 * Examples: "my-plugin", "@org/my-plugin"
 */
export type PluginName = string;

export interface HarnessPlugin {
  name: PluginName;
  source: string;
  version?: string;
  description?: string;
  config?: Record<string, unknown>;
  loading?: "eager" | "deferred";
  integrity?: { sha256: string };
  /** Manifest-declared skill locations within the plugin source directory. */
  skills?: Array<{ name: string; path: string }>;
}

export interface McpServerStdio {
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  source?: string;
  version?: string;
  integrity?: { sha256: string };
}

export interface McpServerNetwork {
  transport: "http" | "sse" | "ws";
  url: string;
  headers?: Record<string, string>;
  source?: string;
  version?: string;
}

export type McpServer = McpServerStdio | McpServerNetwork;

export interface EnvDeclaration {
  name: string;
  description: string;
  required?: boolean;
  sensitive?: boolean;
  when?: string;
  default?: string;
}

export interface HarnessInstructions {
  operational?: string | null;
  behavioral?: string | null;
  identity?: string | null;
  "import-mode"?: "merge" | "replace" | "skip";
}

export interface HarnessPermissions {
  tools?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
  };
  paths?: {
    writable?: string[];
    readonly?: string[];
  };
  network?: {
    "allowed-hosts"?: string[];
  };
}

/** Top-level skill reference (HEP-4). Distinct from HarnessPlugin.skills, which
 *  declares skill locations *inside* a plugin source directory. */
export interface HarnessSkillRef {
  name: string;
  source?: string;
  version?: string;
  description?: string;
  enabled?: boolean;
  loading?: "eager" | "deferred";
  integrity?: { sha256: string };
}

/** One deterministic enforcement rule — a linter or a structural test (HEP-3). */
export interface ArchitecturalCheck {
  name: string;
  description: string;
  /** 'block' = violations prevent merge. 'warn' = logged only. Defaults to 'block'. */
  enforcement?: "block" | "warn";
  /** Where the check is defined: 'custom', or a GitHub path. */
  source?: string;
}

export interface ArchitecturalLinter extends ArchitecturalCheck {
  /** Tool-specific configuration; keys are tool-dependent. */
  config?: Record<string, unknown>;
}

export interface ArchitecturalStructuralTest extends ArchitecturalCheck {
  /** Command that runs the test, e.g. 'pnpm test:architecture'. */
  entrypoint?: string;
}

/** A prose guideline the review agent applies before completing a task. */
export interface ArchitecturalReviewPattern {
  name: string;
  rule: string;
  severity?: "error" | "warning" | "info";
}

export interface ArchitecturalReviewPolicy {
  enabled?: boolean;
  model?: string;
  patterns?: ArchitecturalReviewPattern[];
  guidance?: string;
}

/**
 * Declarative architectural constraints (HEP-3). Three enforcement levels:
 * `linters` and `structural-tests` are deterministic, `review-policy` is
 * LLM-applied. Harness Kit preserves the structure and compiles it into a
 * dedicated instruction marker; deterministic commands still run outside the
 * portability engine.
 */
export interface ArchitecturalConstraints {
  linters?: ArchitecturalLinter[];
  "structural-tests"?: ArchitecturalStructuralTest[];
  "review-policy"?: ArchitecturalReviewPolicy;
}

/** An allow/deny pair constraining where a section's entries may come from. */
export interface PolicySourceConstraint {
  "allowed-sources"?: string[];
  "denied-sources"?: string[];
}

/**
 * Organization/team governance constraints. A policy is a ceiling: extending or
 * consuming profiles may narrow it but never widen it. Absent means unconstrained.
 */
export interface HarnessPolicy {
  "mcp-servers"?: PolicySourceConstraint;
  plugins?: PolicySourceConstraint & { "allowed-marketplaces"?: string[] };
  skills?: PolicySourceConstraint;
  permissions?: {
    tools?: { allow?: string[]; deny?: string[] };
    network?: { "allowed-hosts"?: string[] };
  };
  "require-integrity"?: boolean;
}

/**
 * Lossless native configuration captured for one target when no portable
 * Harness Protocol field exists. Values are opaque to other targets and are
 * only written back by the matching adapter.
 */
export type HarnessVendorConfig = Partial<Record<TargetPlatform, Record<string, unknown>>>;

export interface HarnessConfig {
  $schema?: string;
  version: string;
  kind?: "profile" | "fragment";
  metadata?: HarnessMetadata;
  plugins?: HarnessPlugin[];
  skills?: HarnessSkillRef[];
  "architectural-constraints"?: ArchitecturalConstraints;
  "mcp-servers"?: Record<string, McpServer>;
  env?: EnvDeclaration[];
  instructions?: HarnessInstructions;
  permissions?: HarnessPermissions;
  policy?: HarnessPolicy;
  extends?: Array<{ source: string; version?: string }>;
  /** Profile layer. Omitted v1 profiles default to project. */
  scope?: "organization" | "personal" | "project" | "session";
  /** Harness Protocol v2 lossless native extension blocks. */
  vendor?: HarnessVendorConfig;
}

// ── Compile types ────────────────────────────────────────────

export interface CompileOptions {
  target?: TargetPlatform[];
  dryRun?: boolean;
  clean?: boolean;
  verbose?: boolean;
  force?: boolean;
}

export type FileActionType =
  | "create"
  | "update"
  | "skip"
  | "needs-confirmation";

export interface FileAction {
  path: string;
  content: string;
  action: FileActionType;
  platform: TargetPlatform;
  slot: string;
  linesAdded?: number;
}

export interface CompileResult {
  harnessName: string;
  targets: TargetPlatform[];
  files: FileAction[];
  warnings: string[];
  skippedPlugins: string[];
  upToDate?: boolean;
}

// ── Validation types ─────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
  fix?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  isLegacyFormat: boolean;
}

// ── Orphaned block (for --clean) ─────────────────────────────

export interface OrphanedBlock {
  name: string;
  slot: string;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
}

// ── Platform detection ───────────────────────────────────────

export interface DetectedPlatform {
  platform: TargetPlatform;
  indicators: string[];
  needsConfirmation: boolean;
}

// ── Compile report ───────────────────────────────────────────

export interface CompileReportEntry {
  file: string;
  slot: string;
  action: string;
  detail: string;
  platform: TargetPlatform;
}

export interface CompileReport {
  harnessName: string;
  targets: TargetPlatform[];
  entries: CompileReportEntry[];
  warnings: string[];
  skippedPlugins: string[];
}
