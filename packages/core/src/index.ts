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
  ArchitecturalCheck,
  ArchitecturalConstraints,
  ArchitecturalLinter,
  ArchitecturalReviewPattern,
  ArchitecturalReviewPolicy,
  ArchitecturalStructuralTest,
  HarnessConfig,
  HarnessInstructions,
  HarnessMetadata,
  HarnessPermissions,
  HarnessPlugin,
  HarnessPolicy,
  HarnessSkillRef,
  HarnessVendorConfig,
  PolicySourceConstraint,
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

// Target metadata
export type { IntegrationTarget } from "./adapters/target-metadata.js";
export { TARGETS, getTarget, AGENTS_MD_TARGETS } from "./adapters/target-metadata.js";

// Compile
export { compile, computeSourceFingerprint } from "./compile/compile.js";
export { compileInstructions, getAllInstructionFilePaths, getSlotMappings } from "./compile/instructions.js";
export { renderArchitecturalConstraints } from "./compile/architectural-constraints.js";
export { compileMcpServers } from "./compile/mcp-servers.js";
export { compileSkills } from "./compile/skills.js";
export { compilePermissions, buildPermissionsText } from "./compile/permissions.js";
export { resolveExtends } from "./compile/extends.js";

// Discovery (manifest-first skill resolution utilities)
export { findSkillFiles, computeSourceDir } from "./compile/discovery.js";

// Lockfile
export type { LockedPlugin, LockedResource, LockFile } from "./compile/lockfile.js";
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
export type {
  NativeExtensionBlock,
  NativeExtensionFile,
  NativeExtensionSetting,
} from "./portability/native-extensions.js";
export {
  captureNativeExtensions,
  parseNativeExtensionBlock,
} from "./portability/native-extensions.js";
export { scanPortableContent } from "./portability/capsule.js";
export { scanHarnessArtifact } from "./portability/artifact-security.js";
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
export { opencodeAdapter } from "./adapters/opencode/index.js";
export { piAdapter } from "./adapters/pi/index.js";

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
export { skillDirectoryDigest } from "./import/read-skills.js";
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

// ── Fleet (WP-2.4): cross-scope status aggregation ────────────
//
// Composes existing detect() + detectDrift() across every registered
// adapter and every caller-supplied scope (project root, or the user's
// global config root) into one serializable FleetReport. No new detection
// or drift-classification logic — pure aggregation. This is the stable
// contract the CLI's `status` command and the desktop Fleet page consume.
export type {
  FleetScopeKind,
  FleetScope,
  FleetStatus,
  FleetCell,
  FleetRow,
  FleetSummaryCounts,
  FleetReport,
  FleetScopeInput,
  BuildFleetReportContext,
} from "./fleet/index.js";
export { buildFleetReport } from "./fleet/index.js";

// ── Surfaces (cross-harness config management, D1) ───────────
//
// The Surface registry: pure per-surface path/binary/store metadata that
// keys the portability engine. Additive for now — the re-key away from
// TargetPlatform (and from adapters/target-metadata.ts) lands separately.
export type {
  SurfaceId,
  ProductFamily,
  SurfaceScope,
  StoreFormatId,
  PlatformPathOverrides,
  ConfigStore,
  DetectProbe,
  SurfaceDescriptor,
} from "./surfaces/types.js";
export { SURFACE_IDS } from "./surfaces/types.js";
export { SURFACES, PRIORITY_SURFACES, getSurface } from "./surfaces/registry.js";

// ── Whole-harness portability (Protocol v2) ──────────────────
export type {
  HarnessScope,
  HarnessResourceKind,
  ReleaseDigest,
  ResourceIdentity,
  SourceRevision,
  ResourceProvenance,
  HarnessResource,
  LayeredHarnessProfile,
  PolicyViolation,
  LayerResolutionResult,
  CapabilityLevel,
  LifecycleOperation,
  TargetResourceCapability,
  LossItem,
  LossReport,
  ConflictResolution,
  ReconciliationConflict,
  ReconciliationDirection,
  ReconciliationOperation,
  ReconciliationPlan,
  ReconciliationResolution,
  OwnershipFingerprint,
  PortabilityState,
  RedactionFinding,
  InventorySnapshot,
  TransactionFileChange,
  TransactionResult,
  TransactionManifest,
  CapsuleDependency,
  CapsuleManifest,
  CapsuleValidationFinding,
  CapsuleValidationResult,
} from "./portability/types.js";
export { HARNESS_SCOPE_ORDER } from "./portability/types.js";
export {
  stableSerialize,
  digestValue,
  resourceIdentityKey,
  resourceAliasKey,
  resourcesEqual,
  profileToResources,
  resourcesToProfile,
  migrateHarnessV1ToV2,
} from "./portability/resource-model.js";
export { mergePolicyCeilings, evaluatePolicy, resolveProfileLayers, layerFingerprint } from "./portability/layers.js";
export {
  PORTABLE_RESOURCE_KINDS,
  TARGET_CAPABILITY_MATRIX,
  getTargetCapability,
  capabilityForResource,
  buildLossReport,
  assertCapabilityMatrixComplete,
} from "./portability/capabilities.js";
export { reconcileResources, resolveReconciliationPlan } from "./portability/reconcile.js";
export { applyFileTransaction, rollbackFileTransaction } from "./portability/transaction.js";
export {
  EMPTY_PORTABILITY_STATE,
  readPortabilityState,
  writePortabilityState,
  nextPortabilityState,
} from "./portability/state.js";
export { redactInventoryConfig, buildInventorySnapshot } from "./portability/inventory.js";
export type {
  SecretSanitizationFinding,
  SecretSanitizationResult,
} from "./portability/secrets.js";
export { sanitizeCapturedSecrets } from "./portability/secrets.js";
export {
  createCapsuleManifest,
  validateCapsule,
  collectCapsuleFiles,
} from "./portability/capsule.js";
export type { CapsuleFile } from "./portability/capsule.js";
