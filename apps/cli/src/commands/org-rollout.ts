import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { stringify } from "yaml";
import {
  CURRENT_PROTOCOL_VERSION,
  applyFileTransaction,
  computeFileHash,
  digestValue,
  rollbackFileTransaction,
  skillDirectoryDigest,
  validateCapsule,
  validateHarness,
} from "@harness-kit/core";
import type {
  CapsuleFile,
  CapsuleManifest,
  HarnessConfig,
  TransactionFileChange,
  TransactionManifest,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import { registryRequest } from "../registry-client.js";
import { applyCommand } from "./apply.js";
import {
  buildReconciliationContext,
  readOptional,
  relativeInside,
  timestamp,
} from "./portability-common.js";

interface OrganizationPolicy {
  automaticUpdates?: boolean;
}

interface RolloutRing {
  name: string;
  percentage: number;
  delayMinutes?: number;
}

interface Rollout {
  id: string;
  artifactId: string;
  releaseDigest: string;
  status: "scheduled" | "active" | "paused" | "completed" | "rolled-back";
  effectiveAt: string;
  rings: RolloutRing[];
}

interface DeviceState {
  version: 1;
  installationId: string;
  currentDigest?: string;
  appliedRollouts: Record<string, string>;
}

interface RolloutFlags {
  project?: string;
  target?: string;
  adopt?: boolean;
  yes?: boolean;
  json?: boolean;
}

interface CapsuleBlob {
  manifest: CapsuleManifest;
  files: CapsuleFile[];
}

interface ProfileBlob {
  profile: HarnessConfig;
}

function assertOrganizationProfileSources(profile: HarnessConfig): void {
  const local = [
    ...(profile.skills ?? []).map((entry) => ({ kind: "skill", name: entry.name, source: entry.source })),
    ...(profile.plugins ?? []).map((entry) => ({ kind: "plugin", name: entry.name, source: entry.source })),
  ].find((entry) => entry.source?.startsWith(".") || entry.source?.startsWith("/") || entry.source?.startsWith("~"));
  if (local) {
    throw new Error(`organization profile ${local.kind} '${local.name}' must use an immutable registry or repository source`);
  }
}

function assignmentBucket(installationId: string, rolloutId: string): number {
  return Number.parseInt(createHash("sha256").update(`${installationId}\0${rolloutId}`).digest("hex").slice(0, 8), 16) % 100;
}

export function assignedRing(rollout: Rollout, installationId: string): RolloutRing | null {
  if (!/^sha256:[a-f0-9]{64}$/.test(rollout.releaseDigest) || typeof rollout.artifactId !== "string" || !rollout.artifactId) {
    throw new Error(`rollout ${rollout.id} does not pin a valid artifact and SHA-256 digest`);
  }
  let total = 0;
  for (const ring of rollout.rings) {
    if (
      !ring ||
      typeof ring.name !== "string" ||
      !Number.isInteger(ring.percentage) ||
      ring.percentage <= 0 ||
      ring.percentage > 100 ||
      (ring.delayMinutes !== undefined && (!Number.isFinite(ring.delayMinutes) || ring.delayMinutes < 0))
    ) {
      throw new Error(`rollout ${rollout.id} contains an invalid ring`);
    }
    total += ring.percentage;
  }
  if (total !== 100) throw new Error(`rollout ${rollout.id} ring percentages do not total 100`);

  const bucket = assignmentBucket(installationId, rollout.id);
  let upper = 0;
  for (const ring of rollout.rings) {
    upper += ring.percentage;
    if (bucket < upper) return ring;
  }
  return null;
}

export function selectRollout(
  rollouts: Rollout[],
  installationId: string,
  now = new Date(),
): { rollout: Rollout; ring: RolloutRing } | null {
  const candidates = rollouts
    .filter((rollout) =>
      (rollout.status === "active" || rollout.status === "scheduled") &&
      new Date(rollout.effectiveAt).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime());
  for (const rollout of candidates) {
    const ring = assignedRing(rollout, installationId);
    if (!ring) continue;
    const ringEffectiveAt = new Date(rollout.effectiveAt).getTime() + (ring.delayMinutes ?? 0) * 60_000;
    if (ringEffectiveAt <= now.getTime()) return { rollout, ring };
  }
  return null;
}

async function readDeviceState(projectRoot: string): Promise<{ state: DeviceState; created: boolean }> {
  const content = await readOptional(resolve(projectRoot, ".harness/device.json"));
  if (!content) return {
    state: { version: 1, installationId: randomUUID(), appliedRollouts: {} },
    created: true,
  };
  const state = JSON.parse(content) as DeviceState;
  if (state.version !== 1 || !state.installationId || !state.appliedRollouts) {
    throw new Error("invalid .harness/device.json");
  }
  return { state, created: false };
}

async function persistNewDeviceState(projectRoot: string, state: DeviceState): Promise<void> {
  const ignorePath = resolve(projectRoot, ".harness/.gitignore");
  const changes: TransactionFileChange[] = [{
    path: ".harness/device.json",
    before: null,
    after: `${JSON.stringify(state, null, 2)}\n`,
  }];
  if (await readOptional(ignorePath) === null) {
    changes.push({ path: ".harness/.gitignore", before: null, after: "*\n" });
  }
  const result = await applyFileTransaction(changes, {
    fs: new NodeFsProvider(projectRoot),
    timestamp: `${timestamp()}-device`,
  });
  if (!result.committed) throw new Error(result.error ?? "could not persist rollout installation identity");
}

async function stageRolloutProfile(
  organizationId: string,
  rollout: Rollout,
  blob: CapsuleBlob | ProfileBlob,
): Promise<string> {
  const digest = rollout.releaseDigest.replace(/^sha256:/, "");
  const cacheRoot = resolve(homedir(), ".harness/cache/releases", digest);
  let profile: HarnessConfig;
  const staged: Array<{ path: string; content: string }> = [];

  if ("profile" in blob) {
    if (digestValue(blob.profile) !== rollout.releaseDigest) throw new Error("rollout profile digest mismatch");
    const validation = validateHarness(blob.profile);
    if (!validation.valid) throw new Error("rollout profile is invalid");
    if (blob.profile.scope !== "organization") throw new Error("a rollout profile must declare organization scope");
    assertOrganizationProfileSources(blob.profile);
    profile = blob.profile;
  } else {
    const validation = validateCapsule(blob.manifest, blob.files);
    if (!validation.valid || blob.manifest.digest !== rollout.releaseDigest) {
      throw new Error("rollout capsule failed digest or structural validation");
    }
    if (blob.manifest.identity.kind !== "skill") {
      throw new Error(`capsule rollout for ${blob.manifest.identity.kind} is unsupported; publish a whole organization profile instead`);
    }
    for (const file of blob.files) {
      if (!file.symlink) staged.push({ path: resolve(cacheRoot, "content", file.path), content: file.content });
    }
    const contentDigest = skillDirectoryDigest(blob.files
      .filter((file) => !file.symlink)
      .map((file) => ({ path: file.path, digest: computeFileHash(file.content) })));
    profile = {
      version: CURRENT_PROTOCOL_VERSION,
      kind: "profile",
      scope: "organization",
      metadata: {
        name: `${organizationId}-${blob.manifest.identity.name}`,
        description: `Pinned organization rollout ${rollout.releaseDigest}`,
      },
      skills: [{
        name: blob.manifest.identity.name,
        source: "./content",
        version: blob.manifest.version,
        integrity: { sha256: contentDigest },
      }],
    };
  }

  const profilePath = resolve(cacheRoot, "harness.yaml");
  staged.push({ path: profilePath, content: stringify(profile, { lineWidth: 0 }) });
  const changes: TransactionFileChange[] = [];
  for (const file of staged) {
    const before = await readOptional(file.path);
    if (before !== null && before !== file.content) {
      throw new Error(`content-addressed rollout cache was modified: ${file.path}`);
    }
    if (before === null) changes.push({ path: relativeInside(homedir(), file.path), before: null, after: file.content });
  }
  if (changes.length > 0) {
    const result = await applyFileTransaction(changes, { fs: new NodeFsProvider(homedir()), timestamp: timestamp() });
    if (!result.committed) throw new Error(result.error ?? "could not stage rollout artifact");
  }
  return profilePath;
}

async function report(
  organizationId: string,
  rolloutId: string,
  installationId: string,
  status: "healthy" | "failed" | "rolled-back",
): Promise<void> {
  await registryRequest(`/v1/organizations/${encodeURIComponent(organizationId)}/rollouts/${encodeURIComponent(rolloutId)}/report`, {
    method: "POST",
    body: JSON.stringify({ installationId, status, reportedAt: new Date().toISOString() }),
  });
}

export async function syncOrganizationRollout(organizationId: string, flags: RolloutFlags): Promise<void> {
  const projectPath = resolve(flags.project ?? "harness.yaml");
  const projectRoot = dirname(projectPath);
  const deviceResult = await readDeviceState(projectRoot);
  const device = deviceResult.state;
  if (deviceResult.created) await persistNewDeviceState(projectRoot, device);
  const [policy, rollouts] = await Promise.all([
    registryRequest<OrganizationPolicy>(`/v1/organizations/${encodeURIComponent(organizationId)}/policy`),
    registryRequest<Rollout[]>(`/v1/organizations/${encodeURIComponent(organizationId)}/rollouts`),
  ]);
  const assignment = selectRollout(rollouts, device.installationId);
  if (!assignment) {
    const output = { organizationId, installationId: device.installationId, status: "no-eligible-rollout" };
    if (flags.json) console.log(JSON.stringify(output, null, 2));
    else console.log("No active rollout is eligible for this device yet.");
    return;
  }
  const { rollout, ring } = assignment;
  if (device.appliedRollouts[rollout.id] === rollout.releaseDigest) {
    await report(organizationId, rollout.id, device.installationId, "healthy");
    const output = { organizationId, rolloutId: rollout.id, digest: rollout.releaseDigest, ring: ring.name, status: "current" };
    if (flags.json) console.log(JSON.stringify(output, null, 2));
    else console.log(`Rollout ${rollout.id} is already current (${rollout.releaseDigest}).`);
    return;
  }

  let appliedManifestPath: string | undefined;
  try {
    const blob = await registryRequest<CapsuleBlob | ProfileBlob>(
      `/v1/organizations/${encodeURIComponent(organizationId)}/artifacts/${encodeURIComponent(rollout.artifactId)}/blob`,
    );
    const organizationProfile = await stageRolloutProfile(organizationId, rollout, blob);
    const automatic = policy.automaticUpdates === true;
    const shouldApply = Boolean(flags.yes || automatic);
    const nextDevice: DeviceState = {
      ...device,
      currentDigest: rollout.releaseDigest,
      appliedRollouts: { ...device.appliedRollouts, [rollout.id]: rollout.releaseDigest },
    };
    const devicePath = resolve(projectRoot, ".harness/device.json");
    const apply = await applyCommand(projectPath, {
      organization: organizationProfile,
      target: flags.target,
      adopt: flags.adopt,
      yes: shouldApply,
    }, {
      quiet: true,
      additionalChanges: [{
        path: ".harness/device.json",
        before: await readOptional(devicePath),
        after: `${JSON.stringify(nextDevice, null, 2)}\n`,
      }],
    });
    const output = {
      organizationId,
      installationId: device.installationId,
      rolloutId: rollout.id,
      artifactId: rollout.artifactId,
      digest: rollout.releaseDigest,
      ring: ring.name,
      automatic,
      status: apply.applied ? "applied" : "preview",
      files: apply.files,
    };
    if (!apply.applied) {
      if (flags.json) console.log(JSON.stringify({ ...output, approvalRequired: true }, null, 2));
      else console.log(`Rollout preview: ${rollout.releaseDigest} in ring ${ring.name}; ${apply.files.length} file(s). Re-run with --yes to apply.`);
      return;
    }
    appliedManifestPath = apply.manifestPath;
    const context = await buildReconciliationContext(projectPath, {
      organization: organizationProfile,
      target: flags.target,
    });
    const nonConverged = context.plan.operations.filter((operation) =>
      operation.direction !== "noop" &&
      (operation.desired?.scope === "organization" || operation.base?.scope === "organization"));
    const unhealthy = context.plan.blocked || nonConverged.length > 0;
    if (unhealthy) {
      const detail = nonConverged
        .map((operation) => `${operation.identity.kind}/${operation.alias}=${operation.direction}`)
        .join(", ");
      throw new Error(`post-install reconciliation did not converge${detail ? `: ${detail}` : ""}`);
    }
    await report(organizationId, rollout.id, device.installationId, "healthy");
    if (flags.json) console.log(JSON.stringify(output, null, 2));
    else console.log(`Applied rollout ${rollout.id} (${rollout.releaseDigest}) transactionally; health check passed.`);
  } catch (error) {
    await report(organizationId, rollout.id, device.installationId, "failed").catch(() => undefined);
    if (appliedManifestPath) {
      const manifestContent = await readOptional(resolve(projectRoot, appliedManifestPath));
      if (!manifestContent) throw new Error("automatic last-known-good transaction manifest is missing");
      const manifest = JSON.parse(manifestContent) as TransactionManifest;
      const restored = await rollbackFileTransaction(manifest, {
        fs: new NodeFsProvider(projectRoot),
        timestamp: timestamp(),
      });
      if (!restored.committed) throw new Error(restored.error ?? "automatic last-known-good restoration failed");
      await report(organizationId, rollout.id, device.installationId, "rolled-back").catch(() => undefined);
    }
    throw error;
  }
}
