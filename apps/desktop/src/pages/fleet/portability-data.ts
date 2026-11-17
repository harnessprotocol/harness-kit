import {
  COMPILE_SURFACE_IDS,
  EMPTY_PORTABILITY_STATE,
  TARGET_CAPABILITY_MATRIX,
  buildInventorySnapshot,
  capabilityForResource,
  computeFileHash,
  importProjectValidated,
  LEGACY_PERSONAL_PROFILE_PATH,
  PERSONAL_PROFILE_PATH,
  parseHarness,
  profileToResources,
  readPortabilityState,
  reconcileResources,
  resolveProfileLayers,
  resourcesToProfile,
  stableSerialize,
  skillDirectoryDigest,
  validateHarness,
} from "@harness-kit/core";
import type {
  HarnessResource,
  HarnessScope,
  LayeredHarnessProfile,
  ReconciliationConflict,
  ReconciliationOperation,
  SurfaceId,
  InventorySnapshot,
  PortabilityState,
} from "@harness-kit/core";
import { TauriFsProvider } from "../../lib/harness-fs";
import { readHarnessFile } from "../../lib/tauri";

const TARGETS: SurfaceId[] = [...COMPILE_SURFACE_IDS];

export interface DesktopPortabilitySnapshot {
  generatedAt: string;
  layers: Array<{ scope: HarnessScope; source: string; resources: number }>;
  conflicts: ReconciliationConflict[];
  operations: ReconciliationOperation[];
  lossCount: number;
  capabilityTotals: Record<"native" | "translated" | "source-only" | "unsupported" | "not-applicable", number>;
  capturePreview: { resources: number; targets: number };
  applyPreview: { createsOrUpdates: number; captures: number; deletions: number };
  rollbackHistory: string[];
  lastAppliedAt?: string;
  inventory: Omit<InventorySnapshot, "organizationId">;
  rollout: { status: "not-enrolled" | "current" | "pending" | "paused" | "rolled-back"; detail: string };
}

function parseProfile(text: string, fullPath: string, scope: HarnessScope): LayeredHarnessProfile {
  try {
    const { config } = parseHarness(text);
    const validation = validateHarness(config);
    if (!validation.valid) {
      throw new Error(`${fullPath} is invalid: ${validation.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
    }
    if (config.scope && config.scope !== scope) {
      throw new Error(`${fullPath} declares scope '${config.scope}' but is loaded as '${scope}'`);
    }
    return { scope, config, source: fullPath };
  } catch (error) {
    throw new Error(`could not read ${scope} portability profile: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readProfile(
  fs: TauriFsProvider,
  path: string,
  scope: HarnessScope,
): Promise<LayeredHarnessProfile | null> {
  const fullPath = fs.joinPath(fs.cwd(), path);
  if (!(await fs.exists(fullPath))) return null;
  try {
    return parseProfile(await fs.readFile(fullPath), fullPath, scope);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("could not read ")) throw error;
    throw new Error(`could not read ${scope} portability profile: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * The personal profile, read through the Rust `read_harness_file` command (the
 * reader Profile uses, with its legacy fallback). The webview fs scope does not
 * cover ~/.harness/harness.yaml, so an fs read would report it absent.
 */
async function readPersonalProfile(fs: TauriFsProvider): Promise<LayeredHarnessProfile | null> {
  const result = await readHarnessFile();
  if (!result.found || result.content === null) return null;
  const relative = result.legacy_claude_file ? LEGACY_PERSONAL_PROFILE_PATH : PERSONAL_PROFILE_PATH;
  return parseProfile(result.content, fs.joinPath(fs.cwd(), relative), "personal");
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
  return readPortabilityState(await fs.readFile(path));
}

async function retainManagedSourceOnlyResources(
  fs: TauriFsProvider,
  current: HarnessResource[],
  state: PortabilityState,
): Promise<HarnessResource[]> {
  const result = [...current];
  const keyFor = (resource: HarnessResource) => `${resource.identity.kind}\0${resource.alias}`;
  const indexByKey = new Map(result.map((resource, index) => [keyFor(resource), index]));
  const intact = async (owned: typeof state.ownership): Promise<boolean> =>
    owned.length > 0 && (await Promise.all(owned.map(async (entry) => {
      const path = fs.joinPath(fs.cwd(), entry.path);
      return await fs.exists(path) && `sha256:${computeFileHash(await fs.readFile(path))}` === entry.digest;
    }))).every(Boolean);

  for (const base of state.lastApplied) {
    const key = keyFor(base);
    const skillOwnership = base.identity.kind === "skill"
      ? state.ownership.filter((owned) => owned.slot === "skills" && owned.path.split(/[\\/]+/).includes(base.alias))
      : [];
    const instructionOwnership = base.identity.kind === "instructions"
      ? state.ownership.filter((owned) => ["operational", "behavioral", "identity"].includes(owned.slot))
      : [];
    const owned = skillOwnership.length > 0 ? skillOwnership : instructionOwnership;
    const bytesIntact = await intact(owned);
    const currentIndex = indexByKey.get(key);
    if (currentIndex !== undefined) {
      const currentResource = result[currentIndex];
      const deployedDigest = skillOwnership.length > 0
        ? skillDirectoryDigest(skillOwnership.map((entry) => {
            const segments = entry.path.split(/[\\/]+/);
            const aliasIndex = segments.lastIndexOf(base.alias);
            return { path: segments.slice(aliasIndex + 1).join("/"), digest: entry.digest.slice("sha256:".length) };
          }))
        : undefined;
      const currentDigest = base.identity.kind === "skill"
        ? (currentResource.value as { integrity?: { sha256?: string } }).integrity?.sha256
        : undefined;
      if (bytesIntact && (base.identity.kind !== "skill" || currentDigest === deployedDigest)) result[currentIndex] = base;
      continue;
    }
    const sourceOnly = TARGETS.every((target) => capabilityForResource(target, base, "capture") !== "native");
    if (sourceOnly || bytesIntact) {
      result.push(base);
      indexByKey.set(key, result.length - 1);
    }
  }
  return result;
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

export async function buildDesktopPortabilitySnapshot(
  home: string,
  project?: string | null,
  installationId = "desktop-unregistered",
): Promise<DesktopPortabilitySnapshot> {
  const homeFs = new TauriFsProvider(home);
  const personal = await readPersonalProfile(homeFs);
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
  const capturedCurrent = normalizeCurrent(
    profileToResources({
      scope: project ? "project" : "personal",
      config: captured.harnessConfig,
      source: "native-peer",
    }),
    state.lastApplied,
  );
  const current = await retainManagedSourceOnlyResources(targetFs, capturedCurrent, state);
  const plan = reconcileResources({
    base: state.lastApplied,
    current,
    desired: resolved.resources,
    targets: TARGETS,
    conflicts: resolved.conflicts,
  });
  const capabilityTotals = { native: 0, translated: 0, "source-only": 0, unsupported: 0, "not-applicable": 0 };
  for (const capability of TARGET_CAPABILITY_MATRIX) {
    capabilityTotals[capability.operations.apply] += 1;
  }
  const nonNoop = plan.operations.filter((operation) => operation.direction !== "noop");
  const inventory = buildInventorySnapshot({
    installationId,
    organizationId: "pending-enrollment",
    capturedAt: new Date().toISOString(),
    targets: TARGETS,
    effectiveConfig: resourcesToProfile(resolved.resources, {
      metadata: { name: "desktop-effective", description: "Resolved desktop inventory" },
      scope: project ? "project" : "personal",
    }),
    resources: resolved.resources,
    drift: nonNoop.flatMap((operation) => TARGETS.map((target) => ({
      target,
      path: `${operation.identity.kind}:${operation.alias}`,
      classification: operation.direction,
    }))),
  });
  const { organizationId: _organizationId, ...redactedInventory } = inventory;
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
    inventory: redactedInventory,
    ...(state.appliedAt ? { lastAppliedAt: state.appliedAt } : {}),
    rollout: {
      status: "not-enrolled",
      detail: "Enroll this device in an organization to receive governed rollout assignments.",
    },
  };
}
