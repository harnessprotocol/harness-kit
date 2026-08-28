import {
  EMPTY_PORTABILITY_STATE,
  TARGET_CAPABILITY_MATRIX,
  importProjectValidated,
  parseHarness,
  profileToResources,
  readPortabilityState,
  reconcileResources,
  resolveProfileLayers,
  stableSerialize,
  validateHarness,
} from "@harness-kit/core";
import type {
  HarnessResource,
  HarnessScope,
  LayeredHarnessProfile,
  ReconciliationConflict,
  ReconciliationOperation,
  TargetPlatform,
} from "@harness-kit/core";
import { TauriFsProvider } from "../../lib/harness-fs";

const TARGETS: TargetPlatform[] = [
  "claude-code", "cursor", "copilot", "codex", "opencode", "windsurf", "gemini", "junie",
];

export interface DesktopPortabilitySnapshot {
  generatedAt: string;
  layers: Array<{ scope: HarnessScope; source: string; resources: number }>;
  conflicts: ReconciliationConflict[];
  operations: ReconciliationOperation[];
  lossCount: number;
  capabilityTotals: Record<"native" | "translated" | "source-only" | "unsupported", number>;
  capturePreview: { resources: number; targets: number };
  applyPreview: { createsOrUpdates: number; captures: number; deletions: number };
  rollbackHistory: string[];
  lastAppliedAt?: string;
  rollout: { status: "not-enrolled" | "current" | "pending" | "paused" | "rolled-back"; detail: string };
}

async function readProfile(
  fs: TauriFsProvider,
  path: string,
  scope: HarnessScope,
): Promise<LayeredHarnessProfile | null> {
  const fullPath = fs.joinPath(fs.cwd(), path);
  if (!(await fs.exists(fullPath))) return null;
  try {
    const { config } = parseHarness(await fs.readFile(fullPath));
    if (!validateHarness(config).valid) return null;
    return { scope, config, source: fullPath };
  } catch {
    return null;
  }
}

function normalizeCurrent(resources: HarnessResource[], base: HarnessResource[]): HarnessResource[] {
  const previous = new Map(base.map((resource) => [`${resource.identity.kind}\0${resource.alias}`, resource]));
  return resources.map((resource) => {
    const match = previous.get(`${resource.identity.kind}\0${resource.alias}`);
    return match && stableSerialize(match.value) === stableSerialize(resource.value)
      ? { ...resource, identity: match.identity, revision: match.revision, scope: match.scope }
      : resource;
  });
}

async function readState(fs: TauriFsProvider) {
  const path = fs.joinPath(fs.cwd(), ".harness/state.json");
  if (!(await fs.exists(path))) return EMPTY_PORTABILITY_STATE;
  try {
    return readPortabilityState(await fs.readFile(path));
  } catch {
    return EMPTY_PORTABILITY_STATE;
  }
}

async function rollbackHistory(fs: TauriFsProvider): Promise<string[]> {
  const path = fs.joinPath(fs.cwd(), ".harness/backups");
  if (!(await fs.exists(path))) return [];
  try {
    return (await fs.readDir(path)).sort().reverse().slice(0, 5);
  } catch {
    return [];
  }
}

export async function buildDesktopPortabilitySnapshot(home: string, project?: string | null): Promise<DesktopPortabilitySnapshot> {
  const homeFs = new TauriFsProvider(home);
  const personal = await readProfile(homeFs, ".harness/harness.yaml", "personal");
  const targetFs = project ? new TauriFsProvider(project) : homeFs;
  const projectProfile = project ? await readProfile(targetFs, "harness.yaml", "project") : null;
  const profiles = [personal, projectProfile].filter((profile): profile is LayeredHarnessProfile => Boolean(profile));
  const resolved = resolveProfileLayers(profiles, TARGETS);
  const state = await readState(targetFs);
  const captured = await importProjectValidated({
    fs: targetFs,
    name: project ? "project-peer" : "personal-peer",
    description: "Desktop capture preview.",
  });
  const current = normalizeCurrent(
    profileToResources({
      scope: project ? "project" : "personal",
      config: captured.harnessConfig,
      source: "native-peer",
    }),
    state.lastApplied,
  );
  const plan = reconcileResources({
    base: state.lastApplied,
    current,
    desired: resolved.resources,
    targets: TARGETS,
    conflicts: resolved.conflicts,
  });
  const capabilityTotals = { native: 0, translated: 0, "source-only": 0, unsupported: 0 };
  for (const capability of TARGET_CAPABILITY_MATRIX) {
    capabilityTotals[capability.operations.apply] += 1;
  }
  const nonNoop = plan.operations.filter((operation) => operation.direction !== "noop");
  return {
    generatedAt: new Date().toISOString(),
    layers: profiles.map((profile) => ({
      scope: profile.scope,
      source: profile.source ?? "harness.yaml",
      resources: profileToResources(profile).length,
    })),
    conflicts: plan.conflicts,
    operations: plan.operations,
    lossCount: plan.losses.reduce((total, report) => total + report.losses.length, 0),
    capabilityTotals,
    capturePreview: { resources: current.length, targets: TARGETS.length },
    applyPreview: {
      createsOrUpdates: nonNoop.filter((operation) => operation.direction === "apply-desired").length,
      captures: nonNoop.filter((operation) => operation.direction === "capture-current").length,
      deletions: nonNoop.filter((operation) => operation.direction.startsWith("delete-")).length,
    },
    rollbackHistory: await rollbackHistory(targetFs),
    ...(state.appliedAt ? { lastAppliedAt: state.appliedAt } : {}),
    rollout: {
      status: "not-enrolled",
      detail: "Enroll this device in an organization to receive governed rollout assignments.",
    },
  };
}
