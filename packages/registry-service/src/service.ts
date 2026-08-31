import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  digestValue,
  scanHarnessArtifact,
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
const INVENTORY_TARGETS = new Set([
  // "copilot" is kept alongside "copilot-vscode" for inventories captured
  // before the SurfaceId re-key (legacy clients still report the old id).
  "claude-code", "cursor", "copilot", "copilot-vscode", "codex", "opencode", "windsurf", "gemini", "junie",
]);

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

function assertRole(role: unknown): asserts role is OrganizationRole {
  if (typeof role !== "string" || !Object.hasOwn(ROLE_RANK, role)) {
    throw new RegistryError(400, "role must be member, publisher, or administrator", "invalid_role");
  }
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function assertReleaseLabel(name: unknown, version: unknown): asserts name is string {
  if (typeof name !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(name)) {
    throw new RegistryError(400, "release name must be a lowercase kebab-case identifier", "invalid_release_name");
  }
  if (typeof version !== "string" || !SEMVER.test(version)) {
    throw new RegistryError(400, "release version must be valid semantic versioning", "invalid_release_version");
  }
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
  private lastAuthCleanupAt = 0;

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
    await this.cleanupExpiredAuthRecords();
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
    if (typeof clientName !== "string" || clientName.trim().length === 0 || clientName.length > 100) {
      throw new RegistryError(400, "device client name must be between 1 and 100 characters", "invalid_client");
    }
    await this.cleanupExpiredAuthRecords();
    const deviceCode = randomBytes(32).toString("base64url");
    let userCode: string;
    do {
      userCode = randomBytes(5).toString("hex").toUpperCase();
    } while (await this.repository.get("device-user-code", tokenHash(userCode)));
    const expiresAt = new Date(
      this.now().getTime() + (this.config.deviceCodeTtlSeconds ?? 600) * 1000,
    ).toISOString();
    const authorization: DeviceAuthorization = {
      deviceCode,
      userCode,
      verificationUri: `${(this.config.webBaseUrl ?? this.config.publicBaseUrl).replace(/\/$/, "")}/device`,
      expiresAt,
      interval: 5,
    };
    await this.repository.put(this.record("device-code", tokenHash(deviceCode), {
      ...authorization,
      clientName: clientName.trim(),
      status: "pending",
    }));
    await this.repository.put(this.record("device-user-code", tokenHash(userCode), {
      deviceId: tokenHash(deviceCode),
      expiresAt,
    }));
    return authorization;
  }

  async authorizeDevice(userCode: string, userId: string): Promise<void> {
    const normalizedCode = userCode.toUpperCase();
    const index = await this.repository.get<{ deviceId: string; expiresAt: string }>("device-user-code", tokenHash(normalizedCode));
    const device = index
      ? await this.repository.get<DeviceAuthorization & { status: string; userId?: string }>("device-code", index.data.deviceId)
      : null;
    if (!device || new Date(device.data.expiresAt).getTime() <= this.now().getTime()) {
      if (index) await this.repository.delete("device-user-code", index.id);
      if (device) await this.repository.delete("device-code", device.id);
      throw new RegistryError(404, "device code was not found or expired", "invalid_device_code");
    }
    if (device.data.status !== "pending") {
      throw new RegistryError(409, "device code has already been authorized or consumed", "device_code_used");
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
    await this.repository.delete("device-code", record.id);
    await this.repository.delete("device-user-code", tokenHash(record.data.userCode));
    return { status: "approved", accessToken, expiresIn: this.config.sessionTtlSeconds ?? 900 };
  }

  private async cleanupExpiredAuthRecords(): Promise<void> {
    const now = this.now().getTime();
    if (now - this.lastAuthCleanupAt < 60_000) return;
    this.lastAuthCleanupAt = now;
    for (const kind of ["oauth-state", "device-code", "device-user-code"] as const) {
      const records = await this.repository.list<{ expiresAt?: string; userCode?: string }>(kind);
      for (const record of records) {
        if (!record.data.expiresAt || new Date(record.data.expiresAt).getTime() > now) continue;
        await this.repository.delete(kind, record.id);
        if (kind === "device-code" && record.data.userCode) {
          await this.repository.delete("device-user-code", tokenHash(record.data.userCode));
        }
      }
    }
  }

  async createOrganization(userId: string, input: { slug: string; name: string }): Promise<Organization> {
    if (!input || typeof input.name !== "string" || input.name.trim().length === 0 || input.name.length > 120) {
      throw new RegistryError(400, "organization name is required and must be at most 120 characters", "invalid_organization");
    }
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
    if (!member || typeof member.userId !== "string" || member.userId.trim().length === 0) {
      throw new RegistryError(400, "member userId is required", "invalid_member");
    }
    assertRole(member.role);
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
    if (!policy || typeof policy !== "object") {
      throw new RegistryError(400, "organization policy is required", "invalid_policy");
    }
    if (policy.automaticUpdates !== undefined && typeof policy.automaticUpdates !== "boolean") {
      throw new RegistryError(400, "automaticUpdates must be a boolean", "invalid_policy");
    }
    if (policy.requiredChannel !== undefined && (typeof policy.requiredChannel !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(policy.requiredChannel))) {
      throw new RegistryError(400, "requiredChannel is invalid", "invalid_policy");
    }
    for (const field of ["blockingFindingCodes", "allowedSources", "deniedSources"] as const) {
      const value = policy[field];
      if (value !== undefined && (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0))) {
        throw new RegistryError(400, `${field} must contain non-empty strings`, "invalid_policy");
      }
    }
    if (policy.rolloutRings) {
      const names = new Set<string>();
      let total = 0;
      for (const ring of policy.rolloutRings) {
        if (
          !ring ||
          typeof ring.name !== "string" ||
          ring.name.trim().length === 0 ||
          names.has(ring.name) ||
          !Number.isInteger(ring.percentage) ||
          ring.percentage <= 0 ||
          ring.percentage > 100 ||
          (ring.delayMinutes !== undefined && (!Number.isFinite(ring.delayMinutes) || ring.delayMinutes < 0))
        ) {
          throw new RegistryError(400, "rollout rings require unique names, positive integer percentages, and non-negative delays", "invalid_policy");
        }
        names.add(ring.name);
        total += ring.percentage;
      }
      if (total !== 100) {
        throw new RegistryError(400, "rollout ring percentages must total 100", "invalid_policy");
      }
    }
    const existing = await this.repository.get<OrganizationPolicy>("policy", organizationId);
    if (existing) await this.update(existing, policy);
    else await this.repository.put(this.record("policy", organizationId, policy, organizationId));
    await this.audit(organizationId, userId, "policy.updated", policy);
    return policy;
  }

  async createSecurityException(
    organizationId: string,
    userId: string,
    input: { artifactDigest: string; findingCodes: string[]; reason: string; expiresAt?: string },
  ): Promise<{ id: string } & typeof input> {
    await this.requireRole(organizationId, userId, "administrator");
    if (!Array.isArray(input.findingCodes) || input.findingCodes.length === 0 || !input.findingCodes.every((code) => typeof code === "string" && code.length > 0)) {
      throw new RegistryError(400, "at least one finding code is required", "invalid_exception");
    }
    if (typeof input.reason !== "string" || input.reason.trim().length === 0) {
      throw new RegistryError(400, "security exception reason is required", "invalid_exception");
    }
    if (typeof input.artifactDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(input.artifactDigest)) {
      throw new RegistryError(400, "security exception requires an immutable artifact digest", "invalid_exception");
    }
    if (input.expiresAt !== undefined && (typeof input.expiresAt !== "string" || !Number.isFinite(new Date(input.expiresAt).getTime()))) {
      throw new RegistryError(400, "security exception expiration must be an ISO-8601 timestamp", "invalid_exception");
    }
    const exception = { id: randomUUID(), ...input };
    await this.repository.put(this.record("security-exception", exception.id, exception, organizationId));
    await this.audit(organizationId, userId, "security.exception.created", exception);
    return exception;
  }

  private async validateException(
    organizationId: string,
    exceptionId: string | undefined,
    blockingCodes: string[],
    artifactDigest: string,
  ): Promise<void> {
    if (blockingCodes.length === 0) return;
    if (!exceptionId) {
      throw new RegistryError(422, `artifact blocked by security findings: ${blockingCodes.join(", ")}`, "security_blocked");
    }
    const record = await this.repository.get<{ artifactDigest: string; findingCodes: string[]; expiresAt?: string }>("security-exception", exceptionId);
    if (
      !record ||
      record.organizationId !== organizationId ||
      record.data.artifactDigest !== artifactDigest ||
      (record.data.expiresAt && new Date(record.data.expiresAt).getTime() <= this.now().getTime()) ||
      blockingCodes.some((code) => !record.data.findingCodes.includes(code))
    ) {
      throw new RegistryError(422, "security exception is invalid, expired, or incomplete", "invalid_exception");
    }
  }

  async createArtifact(organizationId: string, userId: string, input: ArtifactInput): Promise<Artifact> {
    await this.requireRole(organizationId, userId, "member");
    if (!input || typeof input !== "object") {
      throw new RegistryError(400, "artifact input is required", "invalid_artifact");
    }
    const capsuleInput = input.type !== "profile" ? input : null;
    const profileInput = input.type === "profile" ? input : null;
    if (profileInput && (!profileInput.profile || typeof profileInput.profile !== "object" || typeof profileInput.digest !== "string")) {
      throw new RegistryError(400, "profile artifact shape is invalid", "invalid_artifact");
    }
    if (capsuleInput && (!capsuleInput.manifest || typeof capsuleInput.manifest !== "object" || !Array.isArray(capsuleInput.files))) {
      throw new RegistryError(400, "capsule artifact shape is invalid", "invalid_artifact");
    }
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
          ...scanHarnessArtifact(profileInput!.profile),
        ];
        })();
    if (profileInput) {
      const localSource = [
        ...(profileInput.profile.skills ?? []).map((entry) => ({ kind: "skill", name: entry.name, source: entry.source })),
        ...(profileInput.profile.plugins ?? []).map((entry) => ({ kind: "plugin", name: entry.name, source: entry.source })),
      ].find((entry) => entry.source?.startsWith(".") || entry.source?.startsWith("/") || entry.source?.startsWith("~"));
      if (localSource) {
        findings.push({
          severity: "block",
          code: "invalid-profile",
          detail: `organization profile ${localSource.kind} '${localSource.name}' must use an immutable registry or repository source`,
        });
      }
    }
    if (profileInput && digestValue(profileInput.profile) !== profileInput.digest) {
      findings.push({ severity: "block", code: "invalid-profile", detail: "profile digest does not match content" });
    }
    const nonBypassable = new Set([
      "invalid-manifest",
      "invalid-entrypoint",
      "invalid-frontmatter",
      "path-escape",
      "symlink",
      "digest-mismatch",
      "undeclared-file",
      "duplicate-alias",
      "size-limit",
      "invalid-native-extension",
      "invalid-profile",
      "credential-value",
    ]);
    const invalidCodes = [...new Set(findings.filter((finding) => nonBypassable.has(finding.code)).map((finding) => finding.code))];
    if (invalidCodes.length > 0) {
      throw new RegistryError(422, `artifact failed structural or credential validation: ${invalidCodes.join(", ")}`, "invalid_artifact");
    }
    const identity = capsuleInput
      ? capsuleInput.manifest.identity
      : {
          kind: "profile" as const,
          source: `profile:${profileInput!.profile.metadata?.name ?? "unnamed"}`,
          name: profileInput!.profile.metadata?.name ?? "unnamed",
        };
    const digest = capsuleInput ? capsuleInput.manifest.digest : profileInput!.digest;
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
    await this.validateException(organizationId, input.exceptionId, blockingCodes, digest);
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
    assertReleaseLabel(input.name, input.version);
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
      if (submission.data.artifactId !== input.artifactId) {
        throw new RegistryError(409, "submission does not refer to the published artifact", "submission_mismatch");
      }
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

  async getPublicRelease(organizationId: string, name: string, version: string): Promise<Release | null> {
    const releases = await this.repository.list<Release>("release", organizationId);
    return releases.find(
      (record) => record.data.name === name && record.data.version === version && record.data.visibility === "public",
    )?.data ?? null;
  }

  async getPublicArtifactByDigest(organizationId: string, digest: string): Promise<Artifact | null> {
    if (!/^sha256:[a-f0-9]{64}$/.test(digest)) return null;
    return (await this.repository.list<Artifact>("artifact", organizationId)).find(
      (record) => record.data.digest === digest && record.data.visibility === "public",
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
    if (
      snapshot.version !== 1 ||
      typeof snapshot.installationId !== "string" ||
      snapshot.installationId.length === 0 ||
      snapshot.installationId.length > 128 ||
      !Number.isFinite(new Date(snapshot.capturedAt).getTime()) ||
      !Array.isArray(snapshot.targets) ||
      !snapshot.targets.every((target) => INVENTORY_TARGETS.has(target)) ||
      !Array.isArray(snapshot.assignments) ||
      !Array.isArray(snapshot.drift) ||
      !Array.isArray(snapshot.redactions)
    ) {
      throw new RegistryError(400, "inventory structure is invalid", "invalid_inventory");
    }
    const forbiddenKeys = /^(?:raw|content|body|prompt|skillBodies|secretValues|environmentContents)$/i;
    const sensitiveKey = /(?:password|token|secret|authorization|api[_-]?key)$/i;
    const credentialValue = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|:\/\/[^\s/:]+:[^\s/@]+@)/;
    const sensitiveFlag = /^--?(?:authorization|token|auth[-_]?token|api[-_]?key|access[-_]?token|access[-_]?key|client[-_]?secret|password|passwd|private[-_]?key|secret)$/i;
    const inlineSensitiveFlag = /^--?(?:authorization|token|auth[-_]?token|api[-_]?key|access[-_]?token|access[-_]?key|client[-_]?secret|password|passwd|private[-_]?key|secret)=(.+)$/i;
    const secretReference = /^(?:\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}|env:[A-Za-z_][A-Za-z0-9_]*|secret:\/\/[^\s]+)$/;
    const visit = (value: unknown, path: string[]): void => {
      if (typeof value === "string" && value !== "[REDACTED]") {
        const inline = value.match(inlineSensitiveFlag);
        if (credentialValue.test(value) || inline && !secretReference.test(inline[1])) {
          throw new RegistryError(422, `inventory contains a credential-shaped value at ${path.join(".")}`, "inventory_leak");
        }
      }
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((child, index) => {
          if (
            index > 0 &&
            typeof value[index - 1] === "string" &&
            sensitiveFlag.test(value[index - 1]) &&
            typeof child === "string" &&
            child !== "[REDACTED]" &&
            !secretReference.test(child)
          ) {
            throw new RegistryError(422, `inventory contains a credential argument at ${[...path, String(index)].join(".")}`, "inventory_leak");
          }
          visit(child, [...path, String(index)]);
        });
        return;
      }
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const rawInstruction = path.at(-1) === "instructions" && /^(?:operational|behavioral|identity)$/.test(key);
        if (forbiddenKeys.test(key) || rawInstruction) {
          throw new RegistryError(422, `inventory contains forbidden field ${[...path, key].join(".")}`, "inventory_leak");
        }
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
    await this.claimInstallation(organizationId, userId, snapshot.installationId);
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
    const effectiveAt = input.effectiveAt ?? this.iso();
    if (!Number.isFinite(new Date(effectiveAt).getTime())) {
      throw new RegistryError(400, "rollout effectiveAt must be an ISO-8601 timestamp", "invalid_rollout");
    }
    const rollout: Rollout = {
      id: randomUUID(),
      releaseId: release.data.id,
      artifactId: release.data.artifactId,
      releaseDigest: release.data.digest,
      ...(input.lastKnownGoodDigest ? { lastKnownGoodDigest: input.lastKnownGoodDigest } : {}),
      status: new Date(effectiveAt).getTime() > this.now().getTime() ? "scheduled" : "active",
      effectiveAt,
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
    if (!["active", "paused", "completed"].includes(status)) {
      throw new RegistryError(400, "rollout status must be active, paused, or completed", "invalid_rollout");
    }
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
    if (
      !input ||
      typeof input.installationId !== "string" ||
      input.installationId.length === 0 ||
      !["pending", "healthy", "failed", "offline", "rolled-back"].includes(input.status) ||
      !Number.isFinite(new Date(input.reportedAt).getTime())
    ) {
      throw new RegistryError(400, "rollout health report is invalid", "invalid_rollout_report");
    }
    await this.claimInstallation(organizationId, userId, input.installationId);
    const record = await this.repository.get<Rollout>("rollout", rolloutId);
    if (!record || record.organizationId !== organizationId) throw new RegistryError(404, "rollout not found", "not_found");
    await this.repository.put(this.record(
      "rollout-report",
      `${rolloutId}:${input.installationId}`,
      { rolloutId, ...input },
      organizationId,
    ));
    const reports = (await this.repository.list<{ rolloutId: string } & Rollout["deviceReports"][number]>("rollout-report", organizationId))
      .filter((report) => report.data.rolloutId === rolloutId)
      .map(({ data: { rolloutId: _rolloutId, ...report } }) => report);
    const updated = { ...record.data, deviceReports: reports };
    if (input.status === "failed") {
      await this.audit(organizationId, userId, "rollout.health-failed", {
        rolloutId,
        installationId: input.installationId,
        automaticRollback: Boolean(record.data.lastKnownGoodDigest),
        digest: record.data.lastKnownGoodDigest,
      });
    }
    return updated;
  }

  async listRollouts(organizationId: string, userId: string): Promise<Rollout[]> {
    await this.requireRole(organizationId, userId, "member");
    const records = await this.repository.list<Rollout>("rollout", organizationId);
    const reports = await this.repository.list<{ rolloutId: string } & Rollout["deviceReports"][number]>("rollout-report", organizationId);
    return Promise.all(records.map(async (record) => {
      const deviceReports = reports
        .filter((report) => report.data.rolloutId === record.data.id)
        .map(({ data: { rolloutId: _rolloutId, ...report } }) => report);
      if (record.data.status !== "scheduled" || new Date(record.data.effectiveAt).getTime() > this.now().getTime()) {
        return { ...record.data, deviceReports };
      }
      const updated = (await this.update(record, { ...record.data, status: "active" as const })).data;
      await this.audit(organizationId, "system", "rollout.active", { rolloutId: updated.id });
      return { ...updated, deviceReports };
    }));
  }

  async listAudit(organizationId: string, userId: string): Promise<Array<Record<string, unknown>>> {
    await this.requireRole(organizationId, userId, "administrator");
    return (await this.repository.list<Record<string, unknown>>("audit", organizationId)).map((record) => record.data);
  }

  private async claimInstallation(organizationId: string, userId: string, installationId: string): Promise<void> {
    const id = `${organizationId}:${installationId}`;
    const existing = await this.repository.get<{ userId: string }>("installation", id);
    if (existing) {
      if (existing.organizationId !== organizationId || existing.data.userId !== userId) {
        throw new RegistryError(403, "installation belongs to another organization member", "installation_forbidden");
      }
      return;
    }
    await this.repository.put(this.record("installation", id, { userId }, organizationId));
    await this.audit(organizationId, userId, "installation.claimed", { installationId });
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
