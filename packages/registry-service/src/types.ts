import type {
  CapsuleManifest,
  CapsuleValidationFinding,
  HarnessConfig,
  InventorySnapshot,
  ReleaseDigest,
  ResourceIdentity,
} from "@harness-kit/core";

export type OrganizationRole = "member" | "publisher" | "administrator";
export type RecordKind =
  | "user"
  | "session"
  | "oauth-state"
  | "device-code"
  | "organization"
  | "membership"
  | "artifact"
  | "submission"
  | "release"
  | "release-history"
  | "policy"
  | "security-exception"
  | "rollout"
  | "audit"
  | "inventory";

export interface RegistryRecord<T = Record<string, unknown>> {
  kind: RecordKind;
  id: string;
  organizationId?: string;
  data: T;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  privateArtifactsByDefault: true;
}

export interface Membership {
  userId: string;
  role: OrganizationRole;
}

export interface CapsuleArtifactInput {
  type?: "capsule";
  manifest: CapsuleManifest;
  files: Array<{ path: string; content: string; symlink?: boolean }>;
  visibility?: "private" | "public";
  exceptionId?: string;
}

export interface ProfileArtifactInput {
  type: "profile";
  profile: HarnessConfig;
  digest: ReleaseDigest;
  exceptionId?: string;
}

export type ArtifactInput = CapsuleArtifactInput | ProfileArtifactInput;

export interface ArtifactSecurityFinding {
  severity: "block" | "warn";
  code: CapsuleValidationFinding["code"] | "invalid-profile" | "credential-value";
  path?: string;
  detail: string;
}

export interface Artifact {
  id: string;
  type: "capsule" | "profile";
  digest: string;
  identity: ResourceIdentity | { kind: "profile"; source: string; name: string };
  version: string;
  visibility: "private" | "public";
  blobKey: string;
  findings: ArtifactSecurityFinding[];
  createdBy: string;
}

export interface Submission {
  id: string;
  artifactId: string;
  status: "pending" | "published" | "rejected";
  submittedBy: string;
  note?: string;
}

export interface Release {
  id: string;
  artifactId: string;
  name: string;
  version: string;
  digest: string;
  channel: string;
  visibility: "private" | "public";
  publishedBy: string;
}

export interface OrganizationPolicy {
  requiredChannel?: string;
  automaticUpdates?: boolean;
  blockingFindingCodes?: string[];
  allowedSources?: string[];
  deniedSources?: string[];
  rolloutRings?: Array<{ name: string; percentage: number; delayMinutes?: number }>;
}

export interface Rollout {
  id: string;
  releaseId: string;
  releaseDigest: string;
  lastKnownGoodDigest?: string;
  status: "scheduled" | "active" | "paused" | "completed" | "rolled-back";
  effectiveAt: string;
  rings: Array<{ name: string; percentage: number; delayMinutes?: number }>;
  deviceReports: Array<{
    installationId: string;
    status: "pending" | "healthy" | "failed" | "offline" | "rolled-back";
    reportedAt: string;
  }>;
}

export interface AuthPrincipal {
  userId: string;
  expiresAt: string;
}

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  interval: number;
}

export interface RegistryServiceConfig {
  publicBaseUrl: string;
  sessionTtlSeconds?: number;
  deviceCodeTtlSeconds?: number;
  now?: () => Date;
}

export type RedactedInventory = InventorySnapshot;
