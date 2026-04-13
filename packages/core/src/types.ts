// ── Target platforms ─────────────────────────────────────────

export type TargetPlatform = "claude-code" | "cursor" | "copilot";

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
  integrity?: { sha256: string };
}

export interface McpServerStdio {
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServerNetwork {
  transport: "http" | "sse" | "ws";
  url: string;
  headers?: Record<string, string>;
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

export interface HarnessConfig {
  $schema?: string;
  version: string;
  kind?: "profile" | "fragment";
  metadata?: HarnessMetadata;
  plugins?: HarnessPlugin[];
  "mcp-servers"?: Record<string, McpServer>;
  env?: EnvDeclaration[];
  instructions?: HarnessInstructions;
  permissions?: HarnessPermissions;
  extends?: Array<{ source: string; version?: string }>;
}

// ── Compile types ────────────────────────────────────────────

export interface CompileOptions {
  target?: TargetPlatform[];
  dryRun?: boolean;
  clean?: boolean;
  verbose?: boolean;
}

export type FileActionType = "create" | "update" | "skip" | "needs-confirmation";

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
