import {
  PostgresRegistryRepository,
  migrate
} from "./chunk-YXATZP6R.js";

// src/server.ts
import { createServer } from "http";
import { fileURLToPath } from "url";

// src/github-oauth.ts
var LiveGitHubOAuthProvider = class {
  constructor(clientId, clientSecret, callbackUrl) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.callbackUrl = callbackUrl;
  }
  clientId;
  clientSecret;
  callbackUrl;
  authorizationUrl(state) {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.callbackUrl);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "read:user user:email");
    return url.toString();
  }
  async exchange(code) {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.callbackUrl
      })
    });
    if (!tokenResponse.ok) throw new Error(`GitHub token exchange failed (${tokenResponse.status})`);
    const tokenBody = await tokenResponse.json();
    if (!tokenBody.access_token) throw new Error(tokenBody.error_description ?? "GitHub did not return an access token");
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenBody.access_token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!userResponse.ok) throw new Error(`GitHub user lookup failed (${userResponse.status})`);
    const user = await userResponse.json();
    return {
      userId: `github:${user.id}`,
      login: user.login,
      ...user.avatar_url ? { avatarUrl: user.avatar_url } : {}
    };
  }
};

// src/service.ts
import { createHash, randomBytes, randomUUID } from "crypto";
import {
  digestValue,
  sanitizeCapturedSecrets,
  validateCapsule,
  validateHarness
} from "@harness-kit/core";
var ROLE_RANK = {
  member: 0,
  publisher: 1,
  administrator: 2
};
var RegistryError = class extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
  status;
  code;
};
function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
function safeSlug(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new RegistryError(400, "organization slug is required", "invalid_slug");
  return slug;
}
function wildcardMatch(pattern, value) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}
function encodeBlob(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}
var RegistryService = class {
  constructor(repository, blobs, config) {
    this.repository = repository;
    this.blobs = blobs;
    this.config = config;
    this.now = config.now ?? (() => /* @__PURE__ */ new Date());
  }
  repository;
  blobs;
  config;
  now;
  iso() {
    return this.now().toISOString();
  }
  record(kind, id, data, organizationId) {
    const now = this.iso();
    return { kind, id, ...organizationId ? { organizationId } : {}, data, createdAt: now, updatedAt: now };
  }
  async update(record, data) {
    const updated = { ...record, data, updatedAt: this.iso() };
    await this.repository.put(updated);
    return updated;
  }
  async issueSessionForUser(userId, ttlSeconds = this.config.sessionTtlSeconds ?? 900) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + ttlSeconds * 1e3).toISOString();
    await this.repository.put(this.record("session", tokenHash(token), { userId, expiresAt }));
    return token;
  }
  async createOAuthState(returnTo = "/") {
    const state = randomBytes(24).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + 10 * 60 * 1e3).toISOString();
    await this.repository.put(this.record("oauth-state", tokenHash(state), { returnTo, expiresAt }));
    return state;
  }
  async consumeOAuthState(state) {
    const record = await this.repository.get("oauth-state", tokenHash(state));
    if (!record || new Date(record.data.expiresAt).getTime() <= this.now().getTime()) {
      throw new RegistryError(400, "OAuth state is invalid or expired", "invalid_oauth_state");
    }
    await this.repository.delete("oauth-state", record.id);
    return { returnTo: record.data.returnTo };
  }
  async authenticate(token) {
    if (!token) throw new RegistryError(401, "authentication required", "unauthorized");
    const session = await this.repository.get("session", tokenHash(token));
    if (!session || new Date(session.data.expiresAt).getTime() <= this.now().getTime()) {
      throw new RegistryError(401, "session is invalid or expired", "invalid_session");
    }
    return session.data;
  }
  async startDeviceAuthorization(clientName) {
    const deviceCode = randomBytes(32).toString("base64url");
    const userCode = randomBytes(5).toString("hex").toUpperCase();
    const expiresAt = new Date(
      this.now().getTime() + (this.config.deviceCodeTtlSeconds ?? 600) * 1e3
    ).toISOString();
    const authorization = {
      deviceCode,
      userCode,
      verificationUri: `${this.config.publicBaseUrl}/device`,
      expiresAt,
      interval: 5
    };
    await this.repository.put(this.record("device-code", tokenHash(deviceCode), {
      ...authorization,
      clientName,
      status: "pending"
    }));
    return authorization;
  }
  async authorizeDevice(userCode, userId) {
    const records = await this.repository.list("device-code");
    const device = records.find((record) => record.data.userCode === userCode.toUpperCase());
    if (!device || new Date(device.data.expiresAt).getTime() <= this.now().getTime()) {
      throw new RegistryError(404, "device code was not found or expired", "invalid_device_code");
    }
    await this.update(device, { ...device.data, status: "approved", userId });
  }
  async pollDeviceAuthorization(deviceCode) {
    const record = await this.repository.get(
      "device-code",
      tokenHash(deviceCode)
    );
    if (!record || new Date(record.data.expiresAt).getTime() <= this.now().getTime()) {
      throw new RegistryError(400, "device code expired", "expired_token");
    }
    if (record.data.status !== "approved" || !record.data.userId) return { status: "authorization_pending" };
    const accessToken = await this.issueSessionForUser(record.data.userId);
    await this.update(record, { ...record.data, status: "consumed" });
    return { status: "approved", accessToken, expiresIn: this.config.sessionTtlSeconds ?? 900 };
  }
  async createOrganization(userId, input) {
    const slug = safeSlug(input.slug);
    const existing = (await this.repository.list("organization")).find((record) => record.data.slug === slug);
    if (existing) throw new RegistryError(409, `organization slug '${slug}' already exists`, "slug_exists");
    const organization = {
      id: randomUUID(),
      slug,
      name: input.name.trim() || slug,
      privateArtifactsByDefault: true
    };
    await this.repository.put(this.record("organization", organization.id, organization, organization.id));
    await this.repository.put(this.record(
      "membership",
      `${organization.id}:${userId}`,
      { userId, role: "administrator" },
      organization.id
    ));
    await this.audit(organization.id, userId, "organization.created", { organizationId: organization.id });
    return organization;
  }
  async listOrganizations(userId) {
    const memberships = await this.repository.list("membership");
    const allowed = new Set(memberships.filter((record) => record.data.userId === userId).map((record) => record.organizationId));
    return (await this.repository.list("organization")).filter((record) => allowed.has(record.id)).map((record) => record.data);
  }
  async membership(organizationId, userId) {
    const membership = await this.repository.get("membership", `${organizationId}:${userId}`);
    if (!membership) throw new RegistryError(403, "not a member of this organization", "forbidden");
    return membership.data;
  }
  async requireRole(organizationId, userId, minimum) {
    const membership = await this.membership(organizationId, userId);
    if (ROLE_RANK[membership.role] < ROLE_RANK[minimum]) {
      throw new RegistryError(403, `${minimum} role is required`, "insufficient_role");
    }
    return membership;
  }
  async listMembers(organizationId, userId) {
    await this.requireRole(organizationId, userId, "member");
    return (await this.repository.list("membership", organizationId)).map((record) => record.data);
  }
  async setMember(organizationId, actorId, member) {
    await this.requireRole(organizationId, actorId, "administrator");
    await this.repository.put(this.record("membership", `${organizationId}:${member.userId}`, member, organizationId));
    await this.audit(organizationId, actorId, "membership.updated", member);
    return member;
  }
  async getPolicy(organizationId, userId) {
    await this.requireRole(organizationId, userId, "member");
    return (await this.repository.get("policy", organizationId))?.data ?? {};
  }
  async setPolicy(organizationId, userId, policy) {
    await this.requireRole(organizationId, userId, "administrator");
    const existing = await this.repository.get("policy", organizationId);
    if (existing) await this.update(existing, policy);
    else await this.repository.put(this.record("policy", organizationId, policy, organizationId));
    await this.audit(organizationId, userId, "policy.updated", policy);
    return policy;
  }
  async createSecurityException(organizationId, userId, input) {
    await this.requireRole(organizationId, userId, "administrator");
    const exception = { id: randomUUID(), ...input };
    await this.repository.put(this.record("security-exception", exception.id, exception, organizationId));
    await this.audit(organizationId, userId, "security.exception.created", exception);
    return exception;
  }
  async validateException(organizationId, exceptionId, blockingCodes) {
    if (blockingCodes.length === 0) return;
    if (!exceptionId) {
      throw new RegistryError(422, `artifact blocked by security findings: ${blockingCodes.join(", ")}`, "security_blocked");
    }
    const record = await this.repository.get("security-exception", exceptionId);
    if (!record || record.organizationId !== organizationId || record.data.expiresAt && new Date(record.data.expiresAt).getTime() <= this.now().getTime() || blockingCodes.some((code) => !record.data.findingCodes.includes(code))) {
      throw new RegistryError(422, "security exception is invalid, expired, or incomplete", "invalid_exception");
    }
  }
  async createArtifact(organizationId, userId, input) {
    await this.requireRole(organizationId, userId, "member");
    const capsuleInput = input.type !== "profile" ? input : null;
    const profileInput = input.type === "profile" ? input : null;
    const findings = capsuleInput ? validateCapsule(capsuleInput.manifest, capsuleInput.files).findings : (() => {
      const validation = validateHarness(profileInput.profile);
      return [
        ...!validation.valid ? validation.errors.map((error) => ({
          severity: "block",
          code: "invalid-profile",
          path: error.path,
          detail: error.message
        })) : [],
        ...sanitizeCapturedSecrets(profileInput.profile).findings.map((finding) => ({
          severity: "block",
          code: "credential-value",
          path: finding.path,
          detail: "profile contains a literal credential value instead of a variable or provider reference"
        }))
      ];
    })();
    const identity = capsuleInput ? capsuleInput.manifest.identity : {
      kind: "profile",
      source: `profile:${profileInput.profile.metadata?.name ?? "unnamed"}`,
      name: profileInput.profile.metadata?.name ?? "unnamed"
    };
    const digest = capsuleInput ? capsuleInput.manifest.digest : profileInput.digest;
    if (profileInput && digestValue(profileInput.profile) !== profileInput.digest) {
      findings.push({ severity: "block", code: "invalid-profile", detail: "profile digest does not match content" });
    }
    const policy = await this.getPolicy(organizationId, userId);
    const source = identity.source;
    if (policy.deniedSources?.some((pattern) => wildcardMatch(pattern, source)) || policy.allowedSources?.length && !policy.allowedSources.some((pattern) => wildcardMatch(pattern, source))) {
      throw new RegistryError(422, `artifact source '${source}' violates organization policy`, "source_blocked");
    }
    const configuredBlocks = new Set(policy.blockingFindingCodes ?? []);
    const blockingCodes = findings.filter((finding) => finding.severity === "block" || configuredBlocks.has(finding.code)).map((finding) => finding.code);
    await this.validateException(organizationId, input.exceptionId, blockingCodes);
    const id = `${organizationId}:${digest}`;
    const existing = await this.repository.get("artifact", id);
    if (existing) return existing.data;
    const blobKey = `artifacts/${digest.slice("sha256:".length)}.json`;
    await this.blobs.putImmutable(
      blobKey,
      encodeBlob(capsuleInput ? { manifest: capsuleInput.manifest, files: capsuleInput.files } : { profile: profileInput.profile }),
      "application/json"
    );
    const artifact = {
      id,
      type: capsuleInput ? "capsule" : "profile",
      digest,
      identity,
      version: capsuleInput ? capsuleInput.manifest.version : profileInput.profile.version,
      visibility: "private",
      blobKey,
      findings,
      createdBy: userId
    };
    await this.repository.put(this.record("artifact", id, artifact, organizationId));
    await this.audit(organizationId, userId, "artifact.created", { artifactId: id, digest });
    return artifact;
  }
  async listArtifacts(organizationId, userId) {
    await this.requireRole(organizationId, userId, "member");
    return (await this.repository.list("artifact", organizationId)).map((record) => record.data);
  }
  async submitArtifact(organizationId, userId, input) {
    await this.requireRole(organizationId, userId, "member");
    const artifact = await this.repository.get("artifact", input.artifactId);
    if (!artifact || artifact.organizationId !== organizationId) throw new RegistryError(404, "artifact not found", "not_found");
    const submission = {
      id: randomUUID(),
      artifactId: input.artifactId,
      status: "pending",
      submittedBy: userId,
      ...input.note ? { note: input.note } : {}
    };
    await this.repository.put(this.record("submission", submission.id, submission, organizationId));
    await this.audit(organizationId, userId, "submission.created", submission);
    return submission;
  }
  async listSubmissions(organizationId, userId) {
    await this.requireRole(organizationId, userId, "publisher");
    return (await this.repository.list("submission", organizationId)).map((record) => record.data);
  }
  async publishRelease(organizationId, userId, input) {
    const membership = await this.requireRole(organizationId, userId, "publisher");
    const artifactRecord = await this.repository.get("artifact", input.artifactId);
    if (!artifactRecord || artifactRecord.organizationId !== organizationId) throw new RegistryError(404, "artifact not found", "not_found");
    const policy = await this.getPolicy(organizationId, userId);
    const channel = policy.requiredChannel ?? input.channel ?? "stable";
    const id = `${organizationId}:${input.name}:${input.version}`;
    const existing = await this.repository.get("release", id);
    if (existing && existing.data.digest !== artifactRecord.data.digest && membership.role !== "administrator") {
      throw new RegistryError(403, "only administrators may repoint an existing version label", "version_repoint_forbidden");
    }
    const release = {
      id,
      artifactId: input.artifactId,
      name: input.name,
      version: input.version,
      digest: artifactRecord.data.digest,
      channel,
      visibility: input.public === true ? "public" : "private",
      publishedBy: userId
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
      const submission = await this.repository.get("submission", input.submissionId);
      if (!submission || submission.organizationId !== organizationId) throw new RegistryError(404, "submission not found", "not_found");
      await this.update(submission, { ...submission.data, status: "published" });
    }
    await this.audit(organizationId, userId, existing ? "release.repointed" : "release.published", release);
    return release;
  }
  async listReleases(organizationId, userId) {
    await this.requireRole(organizationId, userId, "member");
    return (await this.repository.list("release", organizationId)).map((record) => record.data);
  }
  async repointRelease(organizationId, userId, releaseId, artifactId) {
    await this.requireRole(organizationId, userId, "administrator");
    const release = await this.repository.get("release", releaseId);
    if (!release || release.organizationId !== organizationId) throw new RegistryError(404, "release not found", "not_found");
    return this.publishRelease(organizationId, userId, {
      artifactId,
      name: release.data.name,
      version: release.data.version,
      channel: release.data.channel,
      public: release.data.visibility === "public"
    });
  }
  async getPublicRelease(name, version) {
    const releases = await this.repository.list("release");
    return releases.find(
      (record) => record.data.name === name && record.data.version === version && record.data.visibility === "public"
    )?.data ?? null;
  }
  async readArtifactBlob(artifactId, userId) {
    const artifact = await this.repository.get("artifact", artifactId);
    if (!artifact) throw new RegistryError(404, "artifact not found", "not_found");
    if (artifact.data.visibility !== "public") {
      if (!userId || !artifact.organizationId) throw new RegistryError(401, "authentication required", "unauthorized");
      await this.requireRole(artifact.organizationId, userId, "member");
    }
    const blob = await this.blobs.get(artifact.data.blobKey);
    if (!blob) throw new RegistryError(404, "artifact blob not found", "not_found");
    return blob;
  }
  assertInventorySafe(organizationId, snapshot) {
    if (snapshot.organizationId !== organizationId) throw new RegistryError(400, "inventory organization mismatch", "invalid_inventory");
    const forbiddenKeys = /^(?:raw|content|body|prompt|skillBodies|secretValues|environmentContents)$/i;
    const sensitiveKey = /(?:password|token|secret|authorization|api[_-]?key)$/i;
    const visit = (value, path) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (forbiddenKeys.test(key)) throw new RegistryError(422, `inventory contains forbidden field ${[...path, key].join(".")}`, "inventory_leak");
        if (sensitiveKey.test(key) && typeof child === "string" && child !== "[REDACTED]" && !/^\$\{[A-Z_][A-Z0-9_]*\}$/.test(child)) {
          throw new RegistryError(422, `inventory contains a credential-shaped value at ${[...path, key].join(".")}`, "inventory_leak");
        }
        visit(child, [...path, key]);
      }
    };
    visit(snapshot, []);
  }
  async uploadInventory(organizationId, userId, snapshot) {
    await this.requireRole(organizationId, userId, "member");
    this.assertInventorySafe(organizationId, snapshot);
    const id = `${organizationId}:${snapshot.installationId}:${snapshot.capturedAt}`;
    await this.repository.put(this.record("inventory", id, snapshot, organizationId));
    await this.audit(organizationId, userId, "inventory.uploaded", {
      installationId: snapshot.installationId,
      capturedAt: snapshot.capturedAt,
      assignments: snapshot.assignments.length,
      drift: snapshot.drift.length,
      redactions: snapshot.redactions.length
    });
    return snapshot;
  }
  async listInventory(organizationId, userId) {
    await this.requireRole(organizationId, userId, "publisher");
    return (await this.repository.list("inventory", organizationId)).map((record) => record.data);
  }
  async createRollout(organizationId, userId, input) {
    await this.requireRole(organizationId, userId, "administrator");
    const release = await this.repository.get("release", input.releaseId);
    if (!release || release.organizationId !== organizationId) throw new RegistryError(404, "release not found", "not_found");
    const policy = await this.getPolicy(organizationId, userId);
    const rollout = {
      id: randomUUID(),
      releaseId: release.data.id,
      releaseDigest: release.data.digest,
      ...input.lastKnownGoodDigest ? { lastKnownGoodDigest: input.lastKnownGoodDigest } : {},
      status: new Date(input.effectiveAt ?? this.iso()).getTime() > this.now().getTime() ? "scheduled" : "active",
      effectiveAt: input.effectiveAt ?? this.iso(),
      rings: policy.rolloutRings ?? [{ name: "all", percentage: 100 }],
      deviceReports: []
    };
    await this.repository.put(this.record("rollout", rollout.id, rollout, organizationId));
    await this.audit(organizationId, userId, "rollout.created", rollout);
    return rollout;
  }
  async updateRollout(organizationId, userId, rolloutId, status) {
    await this.requireRole(organizationId, userId, "administrator");
    const record = await this.repository.get("rollout", rolloutId);
    if (!record || record.organizationId !== organizationId) throw new RegistryError(404, "rollout not found", "not_found");
    const updated = (await this.update(record, { ...record.data, status })).data;
    await this.audit(organizationId, userId, `rollout.${status}`, { rolloutId });
    return updated;
  }
  async reportRolloutHealth(organizationId, userId, rolloutId, input) {
    await this.requireRole(organizationId, userId, "member");
    const record = await this.repository.get("rollout", rolloutId);
    if (!record || record.organizationId !== organizationId) throw new RegistryError(404, "rollout not found", "not_found");
    const reports = [
      ...record.data.deviceReports.filter((report) => report.installationId !== input.installationId),
      input
    ];
    const failed = input.status === "failed";
    const status = failed && record.data.lastKnownGoodDigest ? "rolled-back" : record.data.status;
    const updated = (await this.update(record, { ...record.data, deviceReports: reports, status })).data;
    if (failed) {
      await this.audit(organizationId, userId, "rollout.health-failed", {
        rolloutId,
        installationId: input.installationId,
        automaticRollback: status === "rolled-back",
        digest: record.data.lastKnownGoodDigest
      });
    }
    return updated;
  }
  async listRollouts(organizationId, userId) {
    await this.requireRole(organizationId, userId, "member");
    return (await this.repository.list("rollout", organizationId)).map((record) => record.data);
  }
  async listAudit(organizationId, userId) {
    await this.requireRole(organizationId, userId, "administrator");
    return (await this.repository.list("audit", organizationId)).map((record) => record.data);
  }
  async audit(organizationId, actorId, action, detail) {
    const data = { actorId, action, detail, occurredAt: this.iso() };
    await this.repository.put(this.record("audit", randomUUID(), data, organizationId));
  }
};

// src/http.ts
function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}
function redirect(response, location, cookie) {
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...cookie ? { "Set-Cookie": cookie } : {}
  });
  response.end();
}
async function readJson(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new RegistryError(413, "request body is too large", "payload_too_large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RegistryError(400, "request body must be valid JSON", "invalid_json");
  }
}
function bearer(request) {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length);
  const cookie = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("hk_session="));
  return cookie?.slice("hk_session=".length);
}
function orgRoute(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "v1" || parts[1] !== "organizations" || !parts[2]) return null;
  return {
    organizationId: decodeURIComponent(parts[2]),
    resource: parts[3] ?? "",
    ...parts[4] ? { resourceId: decodeURIComponent(parts[4]) } : {},
    ...parts[5] ? { action: parts[5] } : {}
  };
}
function createRegistryHttpHandler(service, options = {}) {
  const maxBodyBytes = options.maxBodyBytes ?? 10 * 1024 * 1024;
  return async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", service.config.publicBaseUrl);
      const path = url.pathname.replace(/\/$/, "") || "/";
      if (method === "GET" && path === "/health") {
        json(response, 200, { status: "ok", apiVersion: "v1" });
        return;
      }
      if (method === "POST" && path === "/v1/testing/session" && options.contractBootstrapSecret) {
        if (request.headers["x-contract-secret"] !== options.contractBootstrapSecret) {
          throw new RegistryError(403, "invalid contract bootstrap secret", "forbidden");
        }
        const body = await readJson(request, maxBodyBytes);
        json(response, 201, { accessToken: await service.issueSessionForUser(String(body.userId ?? "contract-admin")) });
        return;
      }
      if (method === "POST" && path === "/v1/auth/device") {
        const body = await readJson(request, maxBodyBytes);
        json(response, 201, await service.startDeviceAuthorization(String(body.clientName ?? "Harness Kit client")));
        return;
      }
      if (method === "POST" && path === "/v1/auth/device/token") {
        const body = await readJson(request, maxBodyBytes);
        json(response, 200, await service.pollDeviceAuthorization(String(body.deviceCode ?? "")));
        return;
      }
      if (method === "GET" && path === "/v1/auth/github/start") {
        if (!options.github) throw new RegistryError(503, "GitHub OAuth is not configured", "oauth_unavailable");
        const state = await service.createOAuthState(url.searchParams.get("returnTo") ?? "/");
        redirect(response, options.github.authorizationUrl(state));
        return;
      }
      if (method === "GET" && path === "/v1/auth/github/callback") {
        if (!options.github) throw new RegistryError(503, "GitHub OAuth is not configured", "oauth_unavailable");
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (!state || !code) throw new RegistryError(400, "OAuth callback is missing code or state", "invalid_oauth_callback");
        const continuation = await service.consumeOAuthState(state);
        const identity = await options.github.exchange(code);
        const token = await service.issueSessionForUser(identity.userId);
        redirect(
          response,
          continuation.returnTo,
          `hk_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${service.config.sessionTtlSeconds ?? 900}`
        );
        return;
      }
      if (method === "GET" && path.startsWith("/v1/public/releases/")) {
        const parts = path.split("/").filter(Boolean);
        const release = await service.getPublicRelease(decodeURIComponent(parts[3] ?? ""), decodeURIComponent(parts[4] ?? ""));
        if (!release) throw new RegistryError(404, "public release not found", "not_found");
        json(response, 200, release);
        return;
      }
      const principal = await service.authenticate(bearer(request));
      if (method === "POST" && path === "/v1/auth/device/authorize") {
        const body = await readJson(request, maxBodyBytes);
        await service.authorizeDevice(String(body.userCode ?? ""), principal.userId);
        json(response, 200, { approved: true });
        return;
      }
      if (path === "/v1/organizations") {
        if (method === "GET") json(response, 200, await service.listOrganizations(principal.userId));
        else if (method === "POST") json(response, 201, await service.createOrganization(principal.userId, await readJson(request, maxBodyBytes)));
        else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      const route = orgRoute(path);
      if (!route) throw new RegistryError(404, "route not found", "not_found");
      const { organizationId, resource, resourceId, action } = route;
      if (resource === "members" && !resourceId) {
        if (method === "GET") json(response, 200, await service.listMembers(organizationId, principal.userId));
        else if (method === "PUT") json(response, 200, await service.setMember(organizationId, principal.userId, await readJson(request, maxBodyBytes)));
        else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "policy" && !resourceId) {
        if (method === "GET") json(response, 200, await service.getPolicy(organizationId, principal.userId));
        else if (method === "PUT") json(response, 200, await service.setPolicy(organizationId, principal.userId, await readJson(request, maxBodyBytes)));
        else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "security-exceptions" && method === "POST") {
        json(response, 201, await service.createSecurityException(organizationId, principal.userId, await readJson(request, maxBodyBytes)));
        return;
      }
      if (resource === "artifacts") {
        if (method === "GET" && !resourceId) json(response, 200, await service.listArtifacts(organizationId, principal.userId));
        else if (method === "POST" && !resourceId) json(response, 201, await service.createArtifact(organizationId, principal.userId, await readJson(request, maxBodyBytes)));
        else if (method === "GET" && resourceId && action === "blob") {
          const blob = await service.readArtifactBlob(resourceId, principal.userId);
          response.writeHead(200, { "Content-Type": "application/json", "Content-Length": blob.byteLength });
          response.end(blob);
        } else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "submissions") {
        if (method === "GET" && !resourceId) json(response, 200, await service.listSubmissions(organizationId, principal.userId));
        else if (method === "POST" && !resourceId) json(response, 201, await service.submitArtifact(organizationId, principal.userId, await readJson(request, maxBodyBytes)));
        else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "releases") {
        if (method === "GET" && !resourceId) json(response, 200, await service.listReleases(organizationId, principal.userId));
        else if (method === "POST" && !resourceId) json(response, 201, await service.publishRelease(organizationId, principal.userId, await readJson(request, maxBodyBytes)));
        else if (method === "PATCH" && resourceId && action === "label") {
          const body = await readJson(request, maxBodyBytes);
          json(response, 200, await service.repointRelease(organizationId, principal.userId, resourceId, String(body.artifactId ?? "")));
        } else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "rollouts") {
        if (method === "GET" && !resourceId) json(response, 200, await service.listRollouts(organizationId, principal.userId));
        else if (method === "POST" && !resourceId) json(response, 201, await service.createRollout(organizationId, principal.userId, await readJson(request, maxBodyBytes)));
        else if (method === "PATCH" && resourceId && !action) {
          const body = await readJson(request, maxBodyBytes);
          json(response, 200, await service.updateRollout(organizationId, principal.userId, resourceId, body.status));
        } else if (method === "POST" && resourceId && action === "report") {
          json(response, 200, await service.reportRolloutHealth(organizationId, principal.userId, resourceId, await readJson(request, maxBodyBytes)));
        } else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "inventory") {
        if (method === "GET") json(response, 200, await service.listInventory(organizationId, principal.userId));
        else if (method === "POST") json(response, 201, await service.uploadInventory(organizationId, principal.userId, await readJson(request, maxBodyBytes)));
        else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "audit" && method === "GET") {
        json(response, 200, await service.listAudit(organizationId, principal.userId));
        return;
      }
      throw new RegistryError(404, "route not found", "not_found");
    } catch (error) {
      if (error instanceof RegistryError) {
        json(response, error.status, { error: error.code, message: error.message });
      } else {
        json(response, 500, { error: "internal_error", message: "Internal server error" });
      }
    }
  };
}

// src/s3.ts
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
var S3BlobStore = class {
  constructor(options) {
    this.options = options;
    this.client = new S3Client({
      region: options.region ?? "us-east-1",
      ...options.endpoint ? { endpoint: options.endpoint } : {},
      forcePathStyle: options.forcePathStyle ?? Boolean(options.endpoint),
      ...options.accessKeyId && options.secretAccessKey ? { credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } } : {}
    });
  }
  options;
  client;
  async putImmutable(key, content, contentType) {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
        Metadata: { immutable: "true" },
        IfNoneMatch: "*"
      }));
      return;
    } catch (error) {
      const existing = await this.get(key);
      if (!existing || Buffer.compare(existing, content) !== 0) {
        if (existing) throw new Error(`immutable blob collision at ${key}`);
        throw error;
      }
    }
  }
  async get(key) {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return result.Body ? result.Body.transformToByteArray() : null;
    } catch {
      return null;
    }
  }
};

// src/server.ts
async function startRegistryServer() {
  const databaseUrl = process.env.DATABASE_URL;
  const bucket = process.env.S3_BUCKET;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? "4810"}`;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!bucket) throw new Error("S3_BUCKET is required");
  if (process.env.MIGRATE_ON_START === "true") await migrate(databaseUrl);
  const repository = PostgresRegistryRepository.fromConnectionString(databaseUrl);
  const blobs = new S3BlobStore({
    bucket,
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  });
  const service = new RegistryService(repository, blobs, { publicBaseUrl });
  const github = process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? new LiveGitHubOAuthProvider(
    process.env.GITHUB_CLIENT_ID,
    process.env.GITHUB_CLIENT_SECRET,
    `${publicBaseUrl}/v1/auth/github/callback`
  ) : void 0;
  const server = createServer(createRegistryHttpHandler(service, {
    github,
    contractBootstrapSecret: process.env.CONTRACT_BOOTSTRAP_SECRET
  }));
  const port = Number(process.env.PORT ?? 4810);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve());
  });
  console.log(`Harness Kit registry listening on ${publicBaseUrl}`);
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startRegistryServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  S3BlobStore,
  LiveGitHubOAuthProvider,
  RegistryError,
  RegistryService,
  createRegistryHttpHandler,
  startRegistryServer
};
//# sourceMappingURL=chunk-7JOQLGTZ.js.map