import { createCapsuleManifest } from "@harness-kit/core";

const base = (process.env.REGISTRY_CONTRACT_URL ?? "").replace(/\/$/, "");
if (!base) throw new Error("REGISTRY_CONTRACT_URL is required");

async function request(
  path: string,
  options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<any> {
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
  if (!response.ok) throw new Error(`${response.status} ${path}: ${body?.message ?? text}`);
  return body;
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
  const publicRelease = await request("/v1/public/releases/contract-skill/1.0.0");
  if (publicRelease.digest !== manifest.digest || release.digest !== manifest.digest) {
    throw new Error("release digest did not remain pinned to the immutable artifact");
  }
  const rollout = await request(`/v1/organizations/${organization.id}/rollouts`, {
    token,
    body: { releaseId: release.id, lastKnownGoodDigest: "sha256:contract-previous" },
  });
  const failed = await request(`/v1/organizations/${organization.id}/rollouts/${rollout.id}/report`, {
    token,
    body: { installationId: "contract-device", status: "failed", reportedAt: new Date().toISOString() },
  });
  if (failed.status !== "rolled-back") throw new Error("failed rollout did not automatically restore last-known-good");
  console.log(JSON.stringify({ ok: true, organizationId: organization.id, artifactDigest: artifact.digest }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
