import {
  buildInventorySnapshot,
  createCapsuleManifest,
  profileToResources,
} from "@harness-kit/core";
import type { HarnessConfig } from "@harness-kit/core";

const base = (process.env.REGISTRY_CONTRACT_URL ?? "").replace(/\/$/, "");
if (!base) throw new Error("REGISTRY_CONTRACT_URL is required");

async function requestResult(
  path: string,
  options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: any; headers: Headers }> {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body, headers: response.headers };
}

async function request(
  path: string,
  options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<any> {
  const result = await requestResult(path, options);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${result.status} ${path}: ${result.body?.message ?? JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function expectStatus(path: string, status: number): Promise<void> {
  const result = await requestResult(path);
  if (result.status !== status) throw new Error(`${path}: expected ${status}, received ${result.status}`);
}

async function main(): Promise<void> {
  const health = await request("/health");
  if (health.apiVersion !== "v1") throw new Error("registry did not report API v1");
  let token = process.env.REGISTRY_CONTRACT_TOKEN;
  if (!token) {
    const secret = process.env.CONTRACT_BOOTSTRAP_SECRET;
    if (!secret) throw new Error("REGISTRY_CONTRACT_TOKEN or CONTRACT_BOOTSTRAP_SECRET is required");
    token = (await request("/v1/testing/session", {
      body: { userId: `contract-admin-${Date.now()}` },
      headers: { "x-contract-secret": secret },
    })).accessToken;
  }
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const organization = await request("/v1/organizations", {
    token,
    body: { slug: `contract-${suffix}`, name: "Registry contract" },
  });
  const device = await request("/v1/auth/device", { body: { clientName: "contract-cli" } });
  await request("/v1/auth/device/authorize", { token, body: { userCode: device.userCode } });
  const deviceSession = await request("/v1/auth/device/token", { body: { deviceCode: device.deviceCode } });
  if (!deviceSession.accessToken) throw new Error("device authorization did not issue an access token");
  await request(`/v1/organizations/${organization.id}/members`, {
    method: "PUT",
    token,
    body: { userId: `contract-publisher-${suffix}`, role: "publisher" },
  });
  const members = await request(`/v1/organizations/${organization.id}/members`, { token });
  if (!members.some((member: { role: string }) => member.role === "publisher")) {
    throw new Error("publisher membership was not persisted");
  }
  await request(`/v1/organizations/${organization.id}/policy`, {
    method: "PUT",
    token,
    body: {
      automaticUpdates: true,
      requiredChannel: "managed",
      rolloutRings: [{ name: "canary", percentage: 10 }, { name: "fleet", percentage: 90 }],
    },
  });
  const policy = await request(`/v1/organizations/${organization.id}/policy`, { token });
  if (!policy.automaticUpdates || policy.rolloutRings?.length !== 2) throw new Error("organization policy did not round-trip");
  const files = [{
    path: "SKILL.md",
    content: "---\nname: contract-skill\ndescription: Contract skill\n---\n\n# Contract\n",
  }];
  const manifest = createCapsuleManifest(
    { kind: "skill", source: "contract/repo/skill", name: "contract-skill" },
    "1.0.0",
    "SKILL.md",
    files,
  );
  const artifact = await request(`/v1/organizations/${organization.id}/artifacts`, {
    token,
    body: { manifest, files },
  });
  await expectStatus(`/v1/public/organizations/${organization.id}/artifacts/${encodeURIComponent(artifact.digest)}/blob`, 404);
  const privateBlob = await request(`/v1/organizations/${organization.id}/artifacts/${artifact.id}/blob`, { token });
  if (privateBlob.manifest.digest !== manifest.digest) throw new Error("private artifact blob did not match its manifest");
  const submission = await request(`/v1/organizations/${organization.id}/submissions`, {
    token,
    body: { artifactId: artifact.id, note: "contract" },
  });
  const release = await request(`/v1/organizations/${organization.id}/releases`, {
    token,
    body: {
      artifactId: artifact.id,
      name: "contract-skill",
      version: "1.0.0",
      public: true,
      submissionId: submission.id,
    },
  });
  const publicRelease = await request(`/v1/public/organizations/${organization.id}/releases/contract-skill/1.0.0`);
  if (publicRelease.digest !== manifest.digest || release.digest !== manifest.digest) {
    throw new Error("release digest did not remain pinned to the immutable artifact");
  }
  const publicBlob = await request(`/v1/public/organizations/${organization.id}/releases/contract-skill/1.0.0/blob`);
  if (publicBlob.manifest.digest !== manifest.digest) throw new Error("public release blob did not match its release digest");
  const rollout = await request(`/v1/organizations/${organization.id}/rollouts`, {
    token,
    body: { releaseId: release.id, lastKnownGoodDigest: "sha256:contract-previous" },
  });
  await request(`/v1/organizations/${organization.id}/rollouts/${rollout.id}`, {
    method: "PATCH",
    token,
    body: { status: "paused" },
  });
  await request(`/v1/organizations/${organization.id}/rollouts/${rollout.id}`, {
    method: "PATCH",
    token,
    body: { status: "active" },
  });
  const failed = await request(`/v1/organizations/${organization.id}/rollouts/${rollout.id}/report`, {
    token: deviceSession.accessToken,
    body: { installationId: "contract-device", status: "failed", reportedAt: new Date().toISOString() },
  });
  if (!failed.deviceReports.some((report: { installationId: string; status: string }) =>
    report.installationId === "contract-device" && report.status === "failed")) {
    throw new Error("failed rollout health was not recorded for local last-known-good restoration");
  }

  const secondFiles = [{ ...files[0], content: `${files[0].content}\nSecond revision.\n` }];
  const secondManifest = createCapsuleManifest(
    manifest.identity,
    "1.0.1",
    "SKILL.md",
    secondFiles,
  );
  const secondArtifact = await request(`/v1/organizations/${organization.id}/artifacts`, {
    token,
    body: { manifest: secondManifest, files: secondFiles },
  });
  const repointed = await request(`/v1/organizations/${organization.id}/releases/${release.id}/label`, {
    method: "PATCH",
    token,
    body: { artifactId: secondArtifact.id },
  });
  if (repointed.digest !== secondArtifact.digest) throw new Error("administrator label mutation did not select the new artifact");
  const pinnedRollout = (await request(`/v1/organizations/${organization.id}/rollouts`, { token }))
    .find((candidate: { id: string }) => candidate.id === rollout.id);
  if (pinnedRollout?.releaseDigest !== artifact.digest) throw new Error("rollout digest changed after semantic label mutation");
  const immutableBlobResult = await requestResult(
    `/v1/public/organizations/${organization.id}/artifacts/${encodeURIComponent(artifact.digest)}/blob`,
  );
  if (immutableBlobResult.status !== 200 || immutableBlobResult.headers.get("cache-control") !== "public, max-age=31536000, immutable") {
    throw new Error("historical digest was not retained as an immutable public artifact");
  }
  const labelBlobResult = await requestResult(
    `/v1/public/organizations/${organization.id}/releases/contract-skill/1.0.0/blob`,
  );
  if (labelBlobResult.headers.get("cache-control") !== "public, max-age=0, must-revalidate") {
    throw new Error("mutable semantic label response was not configured for revalidation");
  }

  const effectiveConfig: HarnessConfig = {
    version: "2",
    kind: "profile",
    scope: "organization",
    metadata: { name: "contract-inventory", description: "Contract inventory" },
    skills: [{ name: "contract-skill", source: "contract/repo/skill", integrity: { sha256: artifact.digest.replace("sha256:", "") } }],
  };
  const inventory = buildInventorySnapshot({
    installationId: "contract-device",
    organizationId: organization.id,
    capturedAt: new Date().toISOString(),
    targets: ["codex"],
    effectiveConfig,
    resources: profileToResources({ scope: "organization", config: effectiveConfig, source: "contract" }),
    drift: [],
  });
  await request(`/v1/organizations/${organization.id}/inventory`, {
    token: deviceSession.accessToken,
    body: inventory,
  });
  if ((await request(`/v1/organizations/${organization.id}/inventory`, { token })).length !== 1) {
    throw new Error("redacted inventory snapshot was not persisted");
  }
  const audit = await request(`/v1/organizations/${organization.id}/audit`, { token });
  if (!audit.some((event: { action: string }) => event.action === "release.repointed")) {
    throw new Error("release label mutation was not included in audit history");
  }
  console.log(JSON.stringify({
    ok: true,
    organizationId: organization.id,
    artifactDigest: artifact.digest,
    checks: ["device-auth", "members", "policy", "artifacts", "submissions", "releases", "rollouts", "inventory", "audit"],
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
