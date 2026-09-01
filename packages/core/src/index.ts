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
export { isLegacyFormat, isProtocolV2 } from "./utils/legacy.js";
export { CURRENT_PROTOCOL_VERSION } from "./utils/protocol-version.js";

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
  groupSurfacesByAdapter,
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

// ── Observe (Task 7): read-side store executors + codecs ──────
//
// Given a Surface-registry ConfigStore and a resolved absolute path, read
// the store's raw contents into a normalized intermediate shape. Absence is
// "not configured" (empty result), malformed content and unknown formatIds
// degrade to skipped[] diagnostics — never a throw. Per-surface observation
// (Task 8) and normalization/digests (Task 9) build on this.
export type {
  StoreEntry,
  SkippedEntry,
  StoreReadResult,
  SkillStoreValue,
  InstructionsStoreValue,
} from "./observe/read-store.js";
export { readStore } from "./observe/read-store.js";

// ── Observe (Task 8): descriptor-driven surface observation ───
//
// Walks each SurfaceDescriptor's detect probes and config stores, resolves
// paths per scope root and injected platform, and reads every store through
// readStore into flat ObservedResources. Thin and lossless: no
// normalization, digests, or cross-scope dedup (Tasks 9–10 stack on this).
export type {
  ObserveOptions,
  ObservedResource,
  SurfaceObservation,
} from "./observe/observe-surface.js";
export { observeSurface, observeAllSurfaces } from "./observe/observe-surface.js";

// ── Observe (Task 9): cross-surface normalization + digests ───
//
// Turns raw ObservedResources into NormalizedResources with cross-surface
// identity keys and secret-safe content digests: the same logical resource
// digests identically regardless of which surface stored it and in what
// shape. Task 10 (gaps/diffs) consumes this directly.
export type { NormalizedResource } from "./observe/normalize.js";
export { normalizeResource, normalizeObservation, SECRET_PLACEHOLDER } from "./observe/normalize.js";

// ── Observe (Task 10): machine inventory (grid / gaps / diffs) ─
//
// Folds normalized observations into the cross-surface machine grid plus
// derived gaps (AC-9) and structural diffs (AC-8). Pure, JSON-serializable
// output — the single engine call the CLI and desktop Machine views render.
export type {
  CellStatus,
  GridCellEntry,
  GridCell,
  GridRow,
  MachineGap,
  MachineDiff,
  FieldDelta,
  MachineInventory,
} from "./observe/machine-inventory.js";
export { computeMachineInventory, buildMachineInventory } from "./observe/machine-inventory.js";
export type {
  ObservationSnapshotMeta,
  StoredResource,
  ObservationSnapshot,
  StateStore,
  TransactionRecord,
} from "./state/store.js";
export { recordAppliedTransaction } from "./state/ledger.js";
export type { LedgerEntryInput, LedgerOutcome } from "./state/ledger.js";
export type { CodexMcpValue, CodexMcpReadResult } from "./codecs/toml-codex.js";
export { readCodexMcp } from "./codecs/toml-codex.js";
export type { OpenCodeMcpValue, OpenCodeMcpReadResult } from "./codecs/json-opencode.js";
export { readOpenCodeMcpConfig } from "./codecs/json-opencode.js";

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
// keys the portability engine. `SurfaceId` is the engine's key type
// everywhere (the former `TargetPlatform` union was re-keyed onto it).
export type {
  SurfaceId,
  CompileSurfaceId,
  ProductFamily,
  SurfaceScope,
  StoreFormatId,
  PlatformPathOverrides,
  ConfigStore,
  DetectProbe,
  SurfaceDescriptor,
} from "./surfaces/types.js";
export { SURFACE_IDS, COMPILE_SURFACE_IDS, PRODUCT_FAMILIES, isCompileSurface } from "./surfaces/types.js";
export { SURFACES, PRIORITY_SURFACES, getSurface } from "./surfaces/registry.js";

// ── Definitions bundle (cross-harness config management, D7) ─────
//
// Serialization format v1 for the compiled surface-definitions bundle:
// pure construct/validate of the JSON payload. Remote fetch, Ed25519
// signing/verification, and monotonic bundleNumber enforcement are M4;
// M1 loads the bundle from disk or memory.
export type { DefinitionsBundle } from "./definitions/bundle.js";
export { BUNDLE_FORMAT_VERSION, BundleError, toBundle, fromBundle } from "./definitions/bundle.js";

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
  TransactionRootId,
  CapsuleDependency,
  CapsuleManifest,
  CapsuleValidationFinding,
  CapsuleValidationResult,
} from "./portability/types.js";
export { HARNESS_SCOPE_ORDER, HARNESS_RESOURCE_KINDS } from "./portability/types.js";
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
export type { MigrationPreview } from "./portability/resource-model.js";
export {
  LEGACY_SURFACE_RENAMES,
  migrateHarnessV2ToV21,
  migrateToCurrent,
} from "./portability/migrate-v21.js";
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
export type { TransactionContext, TransactionRoot } from "./portability/transaction.js";
export {
  createHomeTransactionRoot,
  homeWriteScope,
  isWritableHomePath,
} from "./surfaces/write-scope.js";
export type { HomeWriteScope } from "./surfaces/write-scope.js";
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
