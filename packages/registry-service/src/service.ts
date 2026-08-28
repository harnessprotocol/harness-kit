import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  digestValue,
  sanitizeCapturedSecrets,
  validateCapsule,
  validateHarness,
} from "@harness-kit/core";
import type { BlobStore, RegistryRepository } from "./repository.js";
import type {
  Artifact,
  ArtifactInput,
  AuthPrincipal,
  DeviceAuthorization,
  Membership,
  Organization,
  OrganizationPolicy,
  OrganizationRole,
  RedactedInventory,
  RegistryRecord,
  RegistryServiceConfig,
  Release,
  Rollout,
  Submission,
} from "./types.js";

const ROLE_RANK: Record<OrganizationRole, number> = {
  member: 0,
  publisher: 1,
  administrator: 2,
};

export class RegistryError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) {
    super(message);
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeSlug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new RegistryError(400, "organization slug is required", "invalid_slug");
  return slug;
}

function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function encodeBlob(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export class RegistryService {
  private now: () => Date;

  constructor(
    readonly repository: RegistryRepository,
    readonly blobs: BlobStore,
    readonly config: RegistryServiceConfig,
  ) {
    this.now = config.now ?? (() => new Date());
  }

  private iso(): string {
    return this.now().toISOString();
  }

  private record<T>(kind: RegistryRecord<T>["kind"], id: string, data: T, organizationId?: string): RegistryRecord<T> {
    const now = this.iso();
    return { kind, id, ...(organizationId ? { organizationId } : {}), data, createdAt: now, updatedAt: now };
  }

  private async update<T>(record: RegistryRecord<T>, data: T): Promise<RegistryRecord<T>> {
    const updated = { ...record, data, updatedAt: this.iso() };
    await this.repository.put(updated);
    return updated;
  }

  async issueSessionForUser(userId: string, ttlSeconds = this.config.sessionTtlSeconds ?? 900): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + ttlSeconds * 1000).toISOString();
    await this.repository.put(this.record("session", tokenHash(token), { userId, expiresAt }));
    return token;
  }

  async createOAuthState(returnTo = "/"): Promise<string> {
    const state = randomBytes(24).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + 10 * 60 * 1000).toISOString();
    await this.repository.put(this.record("oauth-state", tokenHash(state), { returnTo, expiresAt }));
    return state;
  }

  async consumeOAuthState(state: string): Promise<{ returnTo: string }> {
    const record = await this.repository.get<{ returnTo: string; expiresAt: string }>("oauth-state", tokenHash(state));
    if (!record || new Date(record.data.expiresAt).getTime() <= this.now().getTime()) {
      throw new RegistryError(400, "OAuth state is invalid or expired", "invalid_oauth_state");
    }
    await this.repository.delete("oauth-state", record.id);
    return { returnTo: record.data.returnTo };
  }

  async authenticate(token: string | undefined): Promise<AuthPrincipal> {
    if (!token) throw new RegistryError(401, "authentication required", "unauthorized");
    const session = await this.repository.get<AuthPrincipal>("session", tokenHash(token));
    if (!session || new Date(session.data.expiresAt).getTime() <= this.now().getTime()) {
      throw new RegistryError(401, "session is invalid or expired", "invalid_session");
    }
    return session.data;
  }

  async startDeviceAuthorization(clientName: string): Promise<DeviceAuthorization> {
    const deviceCode = randomBytes(32).toString("base64url");
    const userCode = randomBytes(5).toString("hex").toUpperCase();
    const expiresAt = new Date(
      this.now().getTime() + (this.config.deviceCodeTtlSeconds ?? 600) * 1000,
    ).toISOString();
    const authorization: DeviceAuthorization = {
      deviceCode,
      userCode,
      verificationUri: `${this.config.publicBaseUrl}/device`,
      expiresAt,
      interval: 5,
    };
    await this.repository.put(this.record("device-code", tokenHash(deviceCode), {
      ...authorization,
      clientName,
      status: "pending",
    }));
    return authorization;
  }

  async authorizeDevice(userCode: string, userId: string): Promise<void> {
    const records = await this.repository.list<DeviceAuthorization & { status: string; userId?: string }>("device-code");
    const device = records.find((record) => record.data.userCode === userCode.toUpperCase());
    if (!device || new Date(device.data.expiresAt).getTime() <= this.now().getTime()) {
      throw new RegistryError(404, "device code was not found or expired", "invalid_device_code");
    }
    await this.update(device, { ...device.data, status: "approved", userId });
  }

  async pollDeviceAuthorization(deviceCode: string): Promise<{ status: string; accessToken?: string; expiresIn?: number }> {
    const record = await this.repository.get<DeviceAuthorization & { status: string; userId?: string }>(
      "device-code",
      tokenHash(deviceCode),
    );
    if (!record || new Date(record.data.expiresAt).getTime() <= this.now().getTime()) {
      throw new RegistryError(400, "device code expired", "expired_token");
    }
    if (record.data.status !== "approved" || !record.data.userId) return { status: "authorization_pending" };
    const accessToken = await this.issueSessionForUser(record.data.userId);
    await this.update(record, { ...record.data, status: "consumed" });
    return { status: "approved", accessToken, expiresIn: this.config.sessionTtlSeconds ?? 900 };
  }

  async createOrganization(userId: string, input: { slug: string; name: string }): Promise<Organization> {
    const slug = safeSlug(input.slug);
    const existing = (await this.repository.list<Organization>("organization")).find((record) => record.data.slug === slug);
    if (existing) throw new RegistryError(409, `organization slug '${slug}' already exists`, "slug_exists");
    const organization: Organization = {
      id: randomUUID(),
      slug,
      name: input.name.trim() || slug,
      privateArtifactsByDefault: true,
    };
    await this.repository.put(this.record("organization", organization.id, organization, organization.id));
    await this.repository.put(this.record(
      "membership",
      `${organization.id}:${userId}`,
      { userId, role: "administrator" } satisfies Membership,
      organization.id,
    ));
    await this.audit(organization.id, userId, "organization.created", { organizationId: organization.id });
    return organization;
  }

  async listOrganizations(userId: string): Promise<Organization[]> {
    const memberships = await this.repository.list<Membership>("membership");
    const allowed = new Set(memberships.filter((record) => record.data.userId === userId).map((record) => record.organizationId));
    return (await this.repository.list<Organization>("organization"))
      .filter((record) => allowed.has(record.id))
      .map((record) => record.data);
  }

  private async membership(organizationId: string, userId: string): Promise<Membership> {
    const membership = await this.repository.get<Membership>("membership", `${organizationId}:${userId}`);
    if (!membership) throw new RegistryError(403, "not a member of this organization", "forbidden");
    return membership.data;
  }

  private async requireRole(organizationId: string, userId: string, minimum: OrganizationRole): Promise<Membership> {
    const membership = await this.membership(organizationId, userId);
    if (ROLE_RANK[membership.role] < ROLE_RANK[minimum]) {
      throw new RegistryError(403, `${minimum} role is required`, "insufficient_role");
    }
    return membership;
  }

  async listMembers(organizationId: string, userId: string): Promise<Membership[]> {
    await this.requireRole(organizationId, userId, "member");
    return (await this.repository.list<Membership>("membership", organizationId)).map((record) => record.data);
  }

  async setMember(
    organizationId: string,
    actorId: string,
    member: Membership,
  ): Promise<Membership> {
    await this.requireRole(organizationId, actorId, "administrator");
    await this.repository.put(this.record("membership", `${organizationId}:${member.userId}`, member, organizationId));
    await this.audit(organizationId, actorId, "membership.updated", member);
    return member;
  }

  async getPolicy(organizationId: string, userId: string): Promise<OrganizationPolicy> {
    await this.requireRole(organizationId, userId, "member");
    return (await this.repository.get<OrganizationPolicy>("policy", organizationId))?.data ?? {};
  }

  async setPolicy(organizationId: string, userId: string, policy: OrganizationPolicy): Promise<OrganizationPolicy> {
    await this.requireRole(organizationId, userId, "administrator");
    const existing = await this.repository.get<OrganizationPolicy>("policy", organizationId);
    if (existing) await this.update(existing, policy);
    else await this.repository.put(this.record("policy", organizationId, policy, organizationId));
    await this.audit(organizationId, userId, "policy.updated", policy);
    return policy;
  }

  async createSecurityException(
    organizationId: string,
    userId: string,
    input: { findingCodes: string[]; reason: string; expiresAt?: string },
  ): Promise<{ id: string } & typeof input> {
    await this.requireRole(organizationId, userId, "administrator");
    const exception = { id: randomUUID(), ...input };
    await this.repository.put(this.record("security-exception", exception.id, exception, organizationId));
    await this.audit(organizationId, userId, "security.exception.created", exception);
    return exception;
  }

  private async validateException(
    organizationId: string,
    exceptionId: string | undefined,
    blockingCodes: string[],
  ): Promise<void> {
    if (blockingCodes.length === 0) return;
    if (!exceptionId) {
      throw new RegistryError(422, `artifact blocked by security findings: ${blockingCodes.join(", ")}`, "security_blocked");
    }
    const record = await this.repository.get<{ findingCodes: string[]; expiresAt?: string }>("security-exception", exceptionId);
    if (
      !record ||
      record.organizationId !== organizationId ||
      (record.data.expiresAt && new Date(record.data.expiresAt).getTime() <= this.now().getTime()) ||
      blockingCodes.some((code) => !record.data.findingCodes.includes(code))
    ) {
      throw new RegistryError(422, "security exception is invalid, expired, or incomplete", "invalid_exception");
    }
  }

  async createArtifact(organizationId: string, userId: string, input: ArtifactInput): Promise<Artifact> {
    await this.requireRole(organizationId, userId, "member");
    const capsuleInput = input.type !== "profile" ? input : null;
    const profileInput = input.type === "profile" ? input : null;
    const findings: Artifact["findings"] = capsuleInput
      ? validateCapsule(capsuleInput.manifest, capsuleInput.files).findings
      : (() => {
          const validation = validateHarness(profileInput!.profile);
          return [
          ...(!validation.valid
            ? validation.errors.map((error) => ({
                severity: "block" as const,
                code: "invalid-profile" as const,
                path: error.path,
                detail: error.message,
              }))
            : []),
          ...sanitizeCapturedSecrets(profileInput!.profile).findings.map((finding) => ({
            severity: "block" as const,
            code: "credential-value" as const,
            path: finding.path,
            detail: "profile contains a literal credential value instead of a variable or provider reference",
          })),
        ];
        })();
    const identity = capsuleInput
      ? capsuleInput.manifest.identity
      : {
          kind: "profile" as const,
          source: `profile:${profileInput!.profile.metadata?.name ?? "unnamed"}`,
          name: profileInput!.profile.metadata?.name ?? "unnamed",
        };
    const digest = capsuleInput ? capsuleInput.manifest.digest : profileInput!.digest;
    if (profileInput && digestValue(profileInput.profile) !== profileInput.digest) {
      findings.push({ severity: "block", code: "invalid-profile", detail: "profile digest does not match content" });
    }
    const policy = await this.getPolicy(organizationId, userId);
    const source = identity.source;
    if (
      policy.deniedSources?.some((pattern) => wildcardMatch(pattern, source)) ||
      (policy.allowedSources?.length && !policy.allowedSources.some((pattern) => wildcardMatch(pattern, source)))
    ) {
      throw new RegistryError(422, `artifact source '${source}' violates organization policy`, "source_blocked");
    }
    const configuredBlocks = new Set(policy.blockingFindingCodes ?? []);
    const blockingCodes = findings
      .filter((finding) => finding.severity === "block" || configuredBlocks.has(finding.code))
      .map((finding) => finding.code);
    await this.validateException(organizationId, input.exceptionId, blockingCodes);
    const id = `${organizationId}:${digest}`;
    const existing = await this.repository.get<Artifact>("artifact", id);
    if (existing) return existing.data;
    const blobKey = `artifacts/${digest.slice("sha256:".length)}.json`;
    await this.blobs.putImmutable(
      blobKey,
      encodeBlob(capsuleInput ? { manifest: capsuleInput.manifest, files: capsuleInput.files } : { profile: profileInput!.profile }),
      "application/json",
    );
    const artifact: Artifact = {
      id,
      type: capsuleInput ? "capsule" : "profile",
      digest,
      identity,
      version: capsuleInput ? capsuleInput.manifest.version : profileInput!.profile.version,
      visibility: "private",
      blobKey,
      findings,
      createdBy: userId,
    };
    await this.repository.put(this.record("artifact", id, artifact, organizationId));
    await this.audit(organizationId, userId, "artifact.created", { artifactId: id, digest });
    return artifact;
  }

  async listArtifacts(organizationId: string, userId: string): Promise<Artifact[]> {
    await this.requireRole(organizationId, userId, "member");
    return (await this.repository.list<Artifact>("artifact", organizationId)).map((record) => record.data);
  }

  async submitArtifact(
    organizationId: string,
    userId: string,
    input: { artifactId: string; note?: string },
  ): Promise<Submission> {
    await this.requireRole(organizationId, userId, "member");
    const artifact = await this.repository.get<Artifact>("artifact", input.artifactId);
    if (!artifact || artifact.organizationId !== organizationId) throw new RegistryError(404, "artifact not found", "not_found");
    const submission: Submission = {
      id: randomUUID(),
      artifactId: input.artifactId,
      status: "pending",
      submittedBy: userId,
      ...(input.note ? { note: input.note } : {}),
    };
    await this.repository.put(this.record("submission", submission.id, submission, organizationId));
    await this.audit(organizationId, userId, "submission.created", submission);
    return submission;
  }

  async listSubmissions(organizationId: string, userId: string): Promise<Submission[]> {
    await this.requireRole(organizationId, userId, "publisher");
    return (await this.repository.list<Submission>("submission", organizationId)).map((record) => record.data);
  }

  async publishRelease(
    organizationId: string,
    userId: string,
    input: {
      artifactId: string;
      name: string;
      version: string;
      channel?: string;
      public?: boolean;
      submissionId?: string;
    },
  ): Promise<Release> {
    const membership = await this.requireRole(organizationId, userId, "publisher");
    const artifactRecord = await this.repository.get<Artifact>("artifact", input.artifactId);
    if (!artifactRecord || artifactRecord.organizationId !== organizationId) throw new RegistryError(404, "artifact not found", "not_found");
    const policy = await this.getPolicy(organizationId, userId);
    const channel = policy.requiredChannel ?? input.channel ?? "stable";
    const id = `${organizationId}:${input.name}:${input.version}`;
    const existing = await this.repository.get<Release>("release", id);
    if (existing && existing.data.digest !== artifactRecord.data.digest && membership.role !== "administrator") {
      throw new RegistryError(403, "only administrators may repoint an existing version label", "version_repoint_forbidden");
    }
    const release: Release = {
      id,
      artifactId: input.artifactId,
      name: input.name,
      version: input.version,
      digest: artifactRecord.data.digest,
      channel,
      visibility: input.public === true ? "public" : "private",
      publishedBy: userId,
    };
    if (existing) {
      await this.repository.put(this.record("release-history", randomUUID(), existing.data, organizationId));
      await this.update(existing, release);
    } else {
      await this.repository.put(this.record("release", id, release, organizationId));
    }
    if (release.visibility === "public" && artifactRecord.data.visibility !== "public") {
      await this.update(artifactRecord, { ...artifactRecord.data, visibility: "public" });
    }
    if (input.submissionId) {
      const submission = await this.repository.get<Submission>("submission", input.submissionId);
      if (!submission || submission.organizationId !== organizationId) throw new RegistryError(404, "submission not found", "not_found");
      await this.update(submission, { ...submission.data, status: "published" });
    }
    await this.audit(organizationId, userId, existing ? "release.repointed" : "release.published", release);
    return release;
  }

  async listReleases(organizationId: string, userId: string): Promise<Release[]> {
    await this.requireRole(organizationId, userId, "member");
    return (await this.repository.list<Release>("release", organizationId)).map((record) => record.data);
  }

  async repointRelease(
    organizationId: string,
    userId: string,
    releaseId: string,
    artifactId: string,
  ): Promise<Release> {
    await this.requireRole(organizationId, userId, "administrator");
    const release = await this.repository.get<Release>("release", releaseId);
    if (!release || release.organizationId !== organizationId) throw new RegistryError(404, "release not found", "not_found");
    return this.publishRelease(organizationId, userId, {
      artifactId,
      name: release.data.name,
      version: release.data.version,
      channel: release.data.channel,
      public: release.data.visibility === "public",
    });
  }

  async getPublicRelease(name: string, version: string): Promise<Release | null> {
    const releases = await this.repository.list<Release>("release");
    return releases.find(
      (record) => record.data.name === name && record.data.version === version && record.data.visibility === "public",
    )?.data ?? null;
  }

  async readArtifactBlob(artifactId: string, userId?: string): Promise<Uint8Array> {
    const artifact = await this.repository.get<Artifact>("artifact", artifactId);
    if (!artifact) throw new RegistryError(404, "artifact not found", "not_found");
    if (artifact.data.visibility !== "public") {
      if (!userId || !artifact.organizationId) throw new RegistryError(401, "authentication required", "unauthorized");
      await this.requireRole(artifact.organizationId, userId, "member");
    }
    const blob = await this.blobs.get(artifact.data.blobKey);
    if (!blob) throw new RegistryError(404, "artifact blob not found", "not_found");
    return blob;
  }

  private assertInventorySafe(organizationId: string, snapshot: RedactedInventory): void {
    if (snapshot.organizationId !== organizationId) throw new RegistryError(400, "inventory organization mismatch", "invalid_inventory");
    const forbiddenKeys = /^(?:raw|content|body|prompt|skillBodies|secretValues|environmentContents)$/i;
    const sensitiveKey = /(?:password|token|secret|authorization|api[_-]?key)$/i;
    const visit = (value: unknown, path: string[]): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (forbiddenKeys.test(key)) throw new RegistryError(422, `inventory contains forbidden field ${[...path, key].join(".")}`, "inventory_leak");
        if (
          sensitiveKey.test(key) &&
          typeof child === "string" &&
          child !== "[REDACTED]" &&
          !/^\$\{[A-Z_][A-Z0-9_]*\}$/.test(child)
        ) {
          throw new RegistryError(422, `inventory contains a credential-shaped value at ${[...path, key].join(".")}`, "inventory_leak");
        }
        visit(child, [...path, key]);
      }
    };
    visit(snapshot, []);
  }

  async uploadInventory(organizationId: string, userId: string, snapshot: RedactedInventory): Promise<RedactedInventory> {
    await this.requireRole(organizationId, userId, "member");
    this.assertInventorySafe(organizationId, snapshot);
    const id = `${organizationId}:${snapshot.installationId}:${snapshot.capturedAt}`;
    await this.repository.put(this.record("inventory", id, snapshot, organizationId));
    await this.audit(organizationId, userId, "inventory.uploaded", {
      installationId: snapshot.installationId,
      capturedAt: snapshot.capturedAt,
      assignments: snapshot.assignments.length,
      drift: snapshot.drift.length,
      redactions: snapshot.redactions.length,
    });
    return snapshot;
  }

  async listInventory(organizationId: string, userId: string): Promise<RedactedInventory[]> {
    await this.requireRole(organizationId, userId, "publisher");
    return (await this.repository.list<RedactedInventory>("inventory", organizationId)).map((record) => record.data);
  }

  async createRollout(
    organizationId: string,
    userId: string,
    input: { releaseId: string; effectiveAt?: string; lastKnownGoodDigest?: string },
  ): Promise<Rollout> {
    await this.requireRole(organizationId, userId, "administrator");
    const release = await this.repository.get<Release>("release", input.releaseId);
    if (!release || release.organizationId !== organizationId) throw new RegistryError(404, "release not found", "not_found");
    const policy = await this.getPolicy(organizationId, userId);
    const rollout: Rollout = {
      id: randomUUID(),
      releaseId: release.data.id,
      releaseDigest: release.data.digest,
      ...(input.lastKnownGoodDigest ? { lastKnownGoodDigest: input.lastKnownGoodDigest } : {}),
      status: new Date(input.effectiveAt ?? this.iso()).getTime() > this.now().getTime() ? "scheduled" : "active",
      effectiveAt: input.effectiveAt ?? this.iso(),
      rings: policy.rolloutRings ?? [{ name: "all", percentage: 100 }],
      deviceReports: [],
    };
    await this.repository.put(this.record("rollout", rollout.id, rollout, organizationId));
    await this.audit(organizationId, userId, "rollout.created", rollout);
    return rollout;
  }

  async updateRollout(
    organizationId: string,
    userId: string,
    rolloutId: string,
    status: Extract<Rollout["status"], "active" | "paused" | "completed">,
  ): Promise<Rollout> {
    await this.requireRole(organizationId, userId, "administrator");
    const record = await this.repository.get<Rollout>("rollout", rolloutId);
    if (!record || record.organizationId !== organizationId) throw new RegistryError(404, "rollout not found", "not_found");
    const updated = (await this.update(record, { ...record.data, status })).data;
    await this.audit(organizationId, userId, `rollout.${status}`, { rolloutId });
    return updated;
  }

  async reportRolloutHealth(
    organizationId: string,
    userId: string,
    rolloutId: string,
    input: Rollout["deviceReports"][number],
  ): Promise<Rollout> {
    await this.requireRole(organizationId, userId, "member");
    const record = await this.repository.get<Rollout>("rollout", rolloutId);
    if (!record || record.organizationId !== organizationId) throw new RegistryError(404, "rollout not found", "not_found");
    const reports = [
      ...record.data.deviceReports.filter((report) => report.installationId !== input.installationId),
      input,
    ];
    const failed = input.status === "failed";
    const status = failed && record.data.lastKnownGoodDigest ? "rolled-back" : record.data.status;
    const updated = (await this.update(record, { ...record.data, deviceReports: reports, status })).data;
    if (failed) {
      await this.audit(organizationId, userId, "rollout.health-failed", {
        rolloutId,
        installationId: input.installationId,
        automaticRollback: status === "rolled-back",
        digest: record.data.lastKnownGoodDigest,
      });
    }
    return updated;
  }

  async listRollouts(organizationId: string, userId: string): Promise<Rollout[]> {
    await this.requireRole(organizationId, userId, "member");
    return (await this.repository.list<Rollout>("rollout", organizationId)).map((record) => record.data);
  }

  async listAudit(organizationId: string, userId: string): Promise<Array<Record<string, unknown>>> {
    await this.requireRole(organizationId, userId, "administrator");
    return (await this.repository.list<Record<string, unknown>>("audit", organizationId)).map((record) => record.data);
  }

  private async audit(
    organizationId: string,
    actorId: string,
    action: string,
    detail: unknown,
  ): Promise<void> {
    const data = { actorId, action, detail, occurredAt: this.iso() };
    await this.repository.put(this.record("audit", randomUUID(), data, organizationId));
  }
}
