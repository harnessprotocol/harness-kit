// Types
export type {
  CompileOptions,
  CompileReport,
  CompileReportEntry,
  CompileResult,
  DetectedPlatform,
  EnvDeclaration,
  FileAction,
  FileActionType,
  HarnessConfig,
  HarnessInstructions,
  HarnessMetadata,
  HarnessPermissions,
  HarnessPlugin,
  McpServer,
  McpServerNetwork,
  McpServerStdio,
  OrphanedBlock,
  TargetPlatform,
  ValidationError,
  ValidationResult,
} from "./types.js";

export type { FsProvider } from "./fs-provider.js";
export type { ParseResult } from "./parser/parse-harness.js";

// Security scanner types
export type { ScanOptions } from "./security/scanner.js";
export type { ScanContext, RuleResult, SecurityRule } from "./security/rules.js";
export type {
  FormattedSecurityReport,
  ReportSection,
  FormattedFinding,
  PermissionsSection,
  PermissionItem,
} from "./security/report.js";

// Parser
export { parseHarness } from "./parser/parse-harness.js";

// Validation
export { validateHarness, validateHarnessYaml, validateSkillName } from "./schema/validate.js";

// Platform detection
export { detectPlatforms } from "./detect/detect-platforms.js";

// Compile
export { compile, computeSourceFingerprint } from "./compile/compile.js";
export { compileInstructions, getAllInstructionFilePaths, getSlotMappings } from "./compile/instructions.js";
export { compileMcpServers } from "./compile/mcp-servers.js";
export { compileSkills } from "./compile/skills.js";
export { compilePermissions, buildPermissionsText } from "./compile/permissions.js";
export { resolveExtends } from "./compile/extends.js";

// Discovery (manifest-first skill resolution utilities)
export { findSkillFiles, computeSourceDir } from "./compile/discovery.js";

// Lockfile
export type { LockedPlugin, LockFile } from "./compile/lockfile.js";
export {
  readLockFile,
  writeLockFile,
  isLockFileFresh,
  getMissingLockEntries,
} from "./compile/lockfile.js";

// Check (drift detection)
export type { CheckEntry, CheckResult } from "./compile/check.js";
export {
  computeFileHash,
  extractMarkerContent,
  instructionDrift,
  directorySignature,
  directoriesEqual,
  checkCompiled,
  getCheckableTargets,
} from "./compile/check.js";

// Markers
export {
  buildMarkerBlock,
  findMarkerBlock,
  replaceMarkerBlock,
  appendMarkerBlock,
  findOrphanedMarkerBlocks,
  removeOrphanedBlocks,
} from "./compile/markers.js";

// Report
export { buildReport } from "./report/report.js";

// Utilities
export { posixJoin, posixDirname } from "./utils/posix-path.js";
export { isLegacyFormat } from "./utils/legacy.js";

// Security scanner
export { scanPlugin } from "./security/scanner.js";
export {
  runSecurityRules,
  detectExternalUrls,
  detectEnvVarExfiltration,
  detectBroadFilesystemAccess,
  detectSuspiciousScripts,
  detectNetworkAccess,
  ALL_RULES,
} from "./security/rules.js";
export { formatSecurityReport } from "./security/report.js";

// ── Adapters (WP-2.1 + WP-2.2) ─────────────────────────────────
//
// The bidirectional adapter abstraction. `exportConfig` bodies are real and
// refactored from the pre-existing compile pipeline (byte-identical output).
// `importConfig` bodies are now real too (WP-2.2) for all four registered
// adapters — see each adapter's index.ts and ../import/. `diff` remains
// typed but unimplemented — lands in a future WP.
export type {
  AdapterId,
  HarnessDomain,
  FeatureSupport,
  AdapterCapabilities,
  AdapterContext,
  HarnessAdapter,
  FilePlan,
  DetectResult,
  ImportedFragment,
} from "./adapters/adapter.js";
export { domainSkippedWarning } from "./adapters/adapter.js";
export { domainHasContent } from "./adapters/domain-content.js";
export {
  ADAPTERS,
  getAdapter,
  getAllAdapters,
  adapterIdForTarget,
  groupTargetsByAdapter,
} from "./adapters/registry.js";
export { claudeCodeAdapter } from "./adapters/claude-code/index.js";
export { cursorAdapter } from "./adapters/cursor/index.js";
export { copilotAdapter } from "./adapters/copilot/index.js";
export { agentsMdAdapter } from "./adapters/agents-md/index.js";

// ── Import (WP-2.2): reverse-import engine ────────────────────
//
// Scans a machine's existing native tool configs and synthesizes one
// schema-valid harness.yaml. Node-agnostic — only touches disk through the
// supplied FsProvider.
export type {
  ImportSource,
  Provenance,
  OpaqueInstructionBlock,
  ImportedInstructions,
  ImportedMcpServers,
  ImportedPermissions,
  ImportedSkillRef,
  ImportedSkills,
  AdapterImportResult,
  AdapterFindingsSummary,
  ImportFindings,
  ImportConflict,
  ImportProvenanceMap,
  ImportProjectResult,
} from "./import/types.js";
export type { ImportContext } from "./import/import-project.js";
export type { SynthesizeResult } from "./import/synthesize.js";
export { importProject, importMachine, importProjectValidated } from "./import/import-project.js";
export { synthesize } from "./import/synthesize.js";
export {
  stripHarnessMarkerBlocks,
  isEntirelyMarkerGenerated,
  readInstructionFileAsOpaqueBlock,
} from "./import/read-instructions.js";
export { readMcpConfigFile } from "./import/read-mcp.js";
export { readClaudeSettingsPermissions } from "./import/read-permissions.js";

// ── Fix (WP-2.3): drift diff + repair engine ──────────────────
//
// Detects when a tool's deployed config has diverged from harness.yaml,
// classifies why (missing / modified-inside-markers / user-modified-outside
// / orphaned), and builds a dry-run FixPlan that repairs everything except
// user-authored content outside harness marker blocks — that is NEVER
// auto-touched. Node-agnostic — only touches disk through FsProvider;
// applyFix's caller supplies the backup timestamp (core never calls
// Date.now()).
export type {
  DriftClass,
  DriftItem,
  DriftReport,
  FixPlan,
  FixFileChange,
  FixOperation,
  ApplyFixResult,
} from "./fix/types.js";
export type { ApplyFixContext } from "./fix/apply.js";
export { detectDrift } from "./fix/index.js";
export { buildFixPlan } from "./fix/plan.js";
export { applyFix } from "./fix/apply.js";
export {
  detectInstructionDrift,
  classifyInstructionFile,
  stripAllMarkerBlocks,
  toDriftReport,
} from "./fix/detect.js";
