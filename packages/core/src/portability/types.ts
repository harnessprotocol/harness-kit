import type { HarnessConfig, HarnessPolicy, SurfaceId } from "../types.js";

export type HarnessScope = "organization" | "personal" | "project" | "session";

export const HARNESS_SCOPE_ORDER: readonly HarnessScope[] = [
  "organization",
  "personal",
  "project",
  "session",
] as const;

/** Runtime source of truth for the resource-kind vocabulary (closed set). */
export const HARNESS_RESOURCE_KINDS = [
  "plugin",
  "skill",
  "mcp-server",
  "env",
  "instructions",
  "permissions",
  "architectural-constraints",
  "policy",
  "extends",
  "native-extension",
] as const;

export type HarnessResourceKind = (typeof HARNESS_RESOURCE_KINDS)[number];

export type ReleaseDigest = `sha256:${string}`;

export interface ResourceIdentity {
  kind: HarnessResourceKind;
  source: string;
  name: string;
}

export interface SourceRevision {
  source: string;
  requestedVersion?: string;
  resolvedRevision?: string;
  digest?: ReleaseDigest;
}

export interface ResourceProvenance {
  adapter?: string;
  file?: string;
  scope: HarnessScope;
  capturedAt?: string;
}

export interface HarnessResource<T = unknown> {
  identity: ResourceIdentity;
  /** Flat name required by native target directories. */
  alias: string;
  scope: HarnessScope;
  value: T;
  revision?: SourceRevision;
  provenance: ResourceProvenance;
  /** Set only for a native-extension resource. */
  nativeTarget?: SurfaceId;
}

export interface LayeredHarnessProfile {
  scope: HarnessScope;
  config: HarnessConfig;
  source?: string;
}

export interface PolicyViolation {
  resource: ResourceIdentity;
  rule: string;
  detail: string;
  policyScope: "organization";
}

export interface LayerResolutionResult {
  resources: HarnessResource[];
  shadowed: HarnessResource[];
  conflicts: ReconciliationConflict[];
  policy: HarnessPolicy | undefined;
  policyViolations: PolicyViolation[];
}

/**
 * Cell vocabulary of the capability matrix. `"not-applicable"` marks a
 * resource kind the harness has no concept of at all (surface registry
 * `notApplicable`), as distinct from `"unsupported"` (the concept exists but
 * the operation cannot be performed).
 */
export type CapabilityLevel = "native" | "translated" | "source-only" | "unsupported" | "not-applicable";
export type LifecycleOperation = "capture" | "apply" | "reconcile" | "rollback";

export interface TargetResourceCapability {
  target: SurfaceId;
  resource: HarnessResourceKind;
  operations: Record<LifecycleOperation, CapabilityLevel>;
  scopes: Record<HarnessScope, CapabilityLevel>;
  note?: string;
}

export interface LossItem {
  resource: ResourceIdentity;
  target: SurfaceId;
  operation: LifecycleOperation;
  capability: CapabilityLevel;
  detail: string;
  recoverable: boolean;
}

export interface LossReport {
  target: SurfaceId;
  generatedAt?: string;
  losses: LossItem[];
  portable: boolean;
}

export type ConflictResolution = "use-current" | "use-desired" | "use-base" | "skip";

export interface ReconciliationConflict {
  id: string;
  identity: ResourceIdentity;
  alias: string;
  scope: HarnessScope;
  reason: "divergent-change" | "alias-collision" | "policy-violation";
  base?: HarnessResource;
  current?: HarnessResource;
  desired?: HarnessResource;
  affectedTargets: SurfaceId[];
  allowedResolutions: ConflictResolution[];
  detail: string;
}

export type ReconciliationDirection =
  | "noop"
  | "apply-desired"
  | "capture-current"
  | "delete-native"
  | "delete-portable";

export interface ReconciliationOperation {
  identity: ResourceIdentity;
  alias: string;
  direction: ReconciliationDirection;
  base?: HarnessResource;
  current?: HarnessResource;
  desired?: HarnessResource;
}

export interface ReconciliationPlan {
  operations: ReconciliationOperation[];
  conflicts: ReconciliationConflict[];
  losses: LossReport[];
  blocked: boolean;
}

export interface ReconciliationResolution {
  conflictId: string;
  resolution: ConflictResolution;
}

export interface OwnershipFingerprint {
  path: string;
  target: SurfaceId;
  slot: string;
  digest: ReleaseDigest;
  managed: boolean;
}

export interface PortabilityState {
  version: 1;
  lastApplied: HarnessResource[];
  ownership: OwnershipFingerprint[];
  lastKnownGood?: string;
  appliedAt?: string;
}

export interface RedactionFinding {
  path: string;
  reason: "schema-secret" | "sensitive-key" | "credential-pattern" | "high-entropy";
}

export interface InventorySnapshot {
  version: 1;
  installationId: string;
  organizationId: string;
  capturedAt: string;
  targets: SurfaceId[];
  effectiveConfig: unknown;
  assignments: Array<{
    identity: ResourceIdentity;
    scope: HarnessScope;
    revision?: SourceRevision;
  }>;
  drift: Array<{ target: SurfaceId; path: string; classification: string }>;
  redactions: RedactionFinding[];
}

export interface TransactionFileChange {
  path: string;
  before: string | null;
  after: string | null;
}

export interface TransactionResult {
  committed: boolean;
  written: string[];
  removed: string[];
  rolledBack: string[];
  backupDir: string;
  manifestPath: string;
  error?: string;
}

export interface TransactionManifest {
  version: 1;
  timestamp: string;
  status: "prepared" | "committed" | "rolled-back" | "rollback-failed";
  changes: TransactionFileChange[];
  error?: string;
}

export interface CapsuleDependency {
  path: string;
  digest: ReleaseDigest;
}

export interface CapsuleManifest {
  format: "harness-capsule/v1";
  identity: ResourceIdentity;
  version: string;
  entrypoint: string;
  files: CapsuleDependency[];
  digest: ReleaseDigest;
}

export interface CapsuleValidationFinding {
  severity: "block" | "warn";
  code:
    | "invalid-entrypoint"
    | "invalid-manifest"
    | "invalid-frontmatter"
    | "path-escape"
    | "symlink"
    | "digest-mismatch"
    | "undeclared-file"
    | "duplicate-alias"
    | "size-limit"
    | "dangerous-instruction"
    | "secret-access"
    | "executable-resource"
    | "invalid-native-extension";
  path?: string;
  detail: string;
}

export interface CapsuleValidationResult {
  valid: boolean;
  findings: CapsuleValidationFinding[];
}
