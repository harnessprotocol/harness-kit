export interface Organization { id: string; slug: string; name: string }
export interface Principal { userId: string; expiresAt: string }
export interface Member { userId: string; role: "member" | "publisher" | "administrator" }
export interface Artifact {
  id: string;
  type: "capsule" | "profile";
  digest: string;
  identity: { kind: string; source: string; name: string };
  version: string;
  visibility: "private" | "public";
  findings: Array<{ severity: string; code: string; path?: string; detail: string }>;
}
export interface Submission { id: string; artifactId: string; status: string; submittedBy: string; note?: string }
export interface Release { id: string; artifactId: string; name: string; version: string; digest: string; channel: string; visibility: string }
export interface Policy {
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
  status: string;
  effectiveAt: string;
  rings: Array<{ name: string; percentage: number }>;
  deviceReports: Array<{ installationId: string; status: string; reportedAt: string }>;
}
export interface Inventory {
  installationId: string;
  capturedAt: string;
  targets: string[];
  assignments: Array<{ identity: { kind: string; source: string; name: string }; scope: string; revision?: { digest?: string } }>;
  drift: Array<{ target: string; path: string; classification: string }>;
  redactions: unknown[];
}
export interface AuditEvent { actorId: string; action: string; detail: unknown; occurredAt: string }
export interface AdminData {
  members: Member[];
  artifacts: Artifact[];
  submissions: Submission[];
  releases: Release[];
  policy: Policy;
  rollouts: Rollout[];
  inventory: Inventory[];
  audit: AuditEvent[];
}
