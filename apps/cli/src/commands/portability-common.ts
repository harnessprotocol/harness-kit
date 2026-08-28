import { access, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import {
  EMPTY_PORTABILITY_STATE,
  capabilityForResource,
  computeFileHash,
  parseHarness,
  profileToResources,
  readPortabilityState,
  reconcileResources,
  resolveProfileLayers,
  resolveReconciliationPlan,
  skillDirectoryDigest,
  stableSerialize,
  validateHarness,
} from "@harness-kit/core";
import type {
  HarnessConfig,
  HarnessResource,
  HarnessScope,
  LayeredHarnessProfile,
  PortabilityState,
  ReconciliationPlan,
  ReconciliationResolution,
  TargetPlatform,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";

export const ALL_TARGETS: TargetPlatform[] = [
  "claude-code",
  "cursor",
  "copilot",
  "codex",
  "opencode",
  "windsurf",
  "gemini",
  "junie",
];

export interface LayerFlags {
  organization?: string;
  personal?: string;
  session?: string;
  target?: string;
  resolve?: string[];
}

export interface ReconciliationContext {
  root: string;
  targets: TargetPlatform[];
  profiles: LayeredHarnessProfile[];
  projectProfile: LayeredHarnessProfile;
  state: PortabilityState;
  current: HarnessResource[];
  desired: HarnessResource[];
  initialPlan: ReconciliationPlan;
  plan: ReconciliationPlan;
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function parseTargets(value?: string): TargetPlatform[] {
  if (!value || value === "all") return [...ALL_TARGETS];
  const selected = value.split(",").map((entry) => entry.trim() as TargetPlatform);
  const unknown = selected.filter((target) => !ALL_TARGETS.includes(target));
  if (unknown.length > 0) {
    throw new Error(`unknown target(s): ${unknown.join(", ")}; expected ${ALL_TARGETS.join(", ")} or all`);
  }
  return [...new Set(selected)];
}

export function parseResolutions(values: string[] | undefined): ReconciliationResolution[] {
  return (values ?? []).map((value) => {
    const separator = value.lastIndexOf("=");
    if (separator < 1) throw new Error(`invalid resolution '${value}'; expected conflict-id=choice`);
    const resolution = value.slice(separator + 1) as ReconciliationResolution["resolution"];
    if (!["use-current", "use-desired", "use-base", "skip"].includes(resolution)) {
      throw new Error(`invalid resolution '${resolution}' in '${value}'`);
    }
    return { conflictId: value.slice(0, separator), resolution };
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readProfile(
  path: string,
  scope: HarnessScope,
  optional = false,
): Promise<LayeredHarnessProfile | null> {
  const absolute = resolve(path);
  if (!(await exists(absolute))) {
    if (optional) return null;
    throw new Error(`no harness profile found at ${absolute}`);
  }
  const content = await readFile(absolute, "utf8");
  const { config } = parseHarness(content);
  const validation = validateHarness(config);
  if (!validation.valid) {
    throw new Error(
      `${absolute} is invalid:\n${validation.errors.map((error) => `  ${error.path}: ${error.message}`).join("\n")}`,
    );
  }
  if (config.scope && config.scope !== scope) {
    throw new Error(`${absolute} declares scope '${config.scope}' but was selected as '${scope}'`);
  }
  return { scope, config, source: absolute };
}

export async function loadProfiles(projectPath: string, flags: LayerFlags): Promise<LayeredHarnessProfile[]> {
  const fs = new NodeFsProvider();
  const home = await fs.homedir();
  const profiles: LayeredHarnessProfile[] = [];
  if (flags.organization) profiles.push((await readProfile(flags.organization, "organization"))!);
  const personalPath = flags.personal ?? resolve(home, ".harness/harness.yaml");
  const personal = await readProfile(personalPath, "personal", !flags.personal);
  if (personal) profiles.push(personal);
  profiles.push((await readProfile(projectPath, "project"))!);
  if (flags.session) profiles.push((await readProfile(flags.session, "session"))!);
  return profiles;
}

async function readState(root: string): Promise<PortabilityState> {
  const path = resolve(root, ".harness/state.json");
  return (await exists(path)) ? readPortabilityState(await readFile(path, "utf8")) : EMPTY_PORTABILITY_STATE;
}

function normalizeCapturedIdentity(
  resources: HarnessResource[],
  base: HarnessResource[],
): HarnessResource[] {
  const byAlias = new Map(base.map((resource) => [`${resource.identity.kind}\0${resource.alias}`, resource]));
  return resources.map((resource) => {
    const previous = byAlias.get(`${resource.identity.kind}\0${resource.alias}`);
    if (!previous || stableSerialize(previous.value) !== stableSerialize(resource.value)) return resource;
    return {
      ...resource,
      identity: previous.identity,
      revision: previous.revision,
      scope: previous.scope,
    };
  });
}

async function retainManagedSourceOnlyResources(
  root: string,
  current: HarnessResource[],
  state: PortabilityState,
  targets: TargetPlatform[],
): Promise<HarnessResource[]> {
  const result = [...current];
  const keyFor = (resource: HarnessResource) => `${resource.identity.kind}\0${resource.alias}`;
  const indexByKey = new Map(result.map((resource, index) => [keyFor(resource), index]));
  const ownershipIntact = async (owned: PortabilityState["ownership"]): Promise<boolean> =>
    owned.length > 0 && (await Promise.all(owned.map(async (entry) => {
      const content = await readOptional(resolve(root, entry.path));
      return content !== null && `sha256:${computeFileHash(content)}` === entry.digest;
    }))).every(Boolean);

  for (const base of state.lastApplied) {
    const key = keyFor(base);
    const managedSkill = base.identity.kind === "skill"
      ? state.ownership.filter((owned) =>
          owned.slot === "skills" && owned.path.split(/[\\/]+/).includes(base.alias))
      : [];
    const managedInstructions = base.identity.kind === "instructions"
      ? state.ownership.filter((owned) => ["operational", "behavioral", "identity"].includes(owned.slot))
      : [];
    const managedBytesIntact = await ownershipIntact(
      managedSkill.length > 0 ? managedSkill : managedInstructions,
    );
    const currentIndex = indexByKey.get(key);
    if (currentIndex !== undefined) {
      const currentResource = result[currentIndex];
      const currentSkillDigest = base.identity.kind === "skill"
        ? (currentResource.value as { integrity?: { sha256?: string } }).integrity?.sha256
        : undefined;
      const deployedSkillDigest = managedSkill.length > 0
        ? skillDirectoryDigest(managedSkill.map((owned) => {
            const segments = owned.path.split(/[\\/]+/);
            const aliasIndex = segments.lastIndexOf(base.alias);
            return {
              path: segments.slice(aliasIndex + 1).join("/"),
              digest: owned.digest.slice("sha256:".length),
            };
          }))
        : undefined;
      if (
        managedBytesIntact &&
        (base.identity.kind !== "skill" || currentSkillDigest === deployedSkillDigest)
      ) {
        result[currentIndex] = base;
      }
      continue;
    }
    const sourceOnly = targets.every((target) => capabilityForResource(target, base, "capture") !== "native");
    if (sourceOnly || managedBytesIntact) {
      result.push(base);
      indexByKey.set(key, result.length - 1);
    }
  }
  return result;
}

function managedMarkerContent(content: string, slot: string): string | null {
  const lines = content.split("\n");
  let start = -1;
  let endMarker = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (start < 0 && line.startsWith("<!-- BEGIN harness:") && line.endsWith(`:${slot} -->`)) {
      start = index;
      endMarker = line.replace("<!-- BEGIN ", "<!-- END ");
      continue;
    }
    if (start >= 0 && line === endMarker) return lines.slice(start + 1, index).join("\n");
  }
  return null;
}

async function captureModifiedManagedInstructions(
  root: string,
  current: HarnessResource[],
  state: PortabilityState,
  targets: TargetPlatform[],
): Promise<HarnessResource[]> {
  const result = new Map(current.map((resource) => [`${resource.identity.kind}\0${resource.alias}`, resource]));
  const selectedTargets = new Set(targets);
  for (const base of state.lastApplied.filter((resource) => resource.identity.kind === "instructions")) {
    const resourceKey = `${base.identity.kind}\0${base.alias}`;
    const existing = result.get(resourceKey);
    const value = { ...(base.value as Record<string, unknown>), ...(existing?.value as Record<string, unknown> | undefined) };
    let modified = false;
    for (const owned of state.ownership.filter((entry) =>
      selectedTargets.has(entry.target) && ["operational", "behavioral", "identity"].includes(entry.slot))) {
      const content = await readOptional(resolve(root, owned.path));
      if (content === null || `sha256:${computeFileHash(content)}` === owned.digest) continue;
      const marker = managedMarkerContent(content, owned.slot);
      if (marker === null || value[owned.slot] === marker) continue;
      value[owned.slot] = marker;
      modified = true;
    }
    if (modified) {
      result.set(resourceKey, {
        ...base,
        value,
        provenance: { ...base.provenance, file: "native-peer", adapter: "managed-marker" },
      });
    }
  }
  return [...result.values()];
}

export async function buildReconciliationContext(
  projectPath: string,
  flags: LayerFlags,
): Promise<ReconciliationContext> {
  const absoluteProjectPath = resolve(projectPath);
  const root = dirname(absoluteProjectPath);
  const targets = parseTargets(flags.target);
  const profiles = await loadProfiles(absoluteProjectPath, flags);
  const projectProfile = profiles.find((profile) => profile.scope === "project")!;
  const layerResult = resolveProfileLayers(profiles, targets);
  const state = await readState(root);
  const fs = new NodeFsProvider(root);
  const { importProjectValidated } = await import("@harness-kit/core");
  const capture = await importProjectValidated({
    fs,
    name: basename(root),
    description: "Current native harness peer state captured for reconciliation.",
  });
  const capturedCurrent = normalizeCapturedIdentity(
    profileToResources({ scope: "project", config: capture.harnessConfig, source: "native-peer" }),
    state.lastApplied,
  );
  const retainedCurrent = await retainManagedSourceOnlyResources(root, capturedCurrent, state, targets);
  const current = await captureModifiedManagedInstructions(root, retainedCurrent, state, targets);
  const initial = reconcileResources({
    base: state.lastApplied,
    current,
    desired: layerResult.resources,
    targets,
    conflicts: layerResult.conflicts,
  });
  const resolutions = parseResolutions(flags.resolve);
  const plan = resolutions.length > 0 ? resolveReconciliationPlan(initial, resolutions) : initial;
  return {
    root,
    targets,
    profiles,
    projectProfile,
    state,
    current,
    desired: layerResult.resources,
    initialPlan: initial,
    plan,
  };
}

export function relativeInside(root: string, path: string): string {
  const absolute = isAbsolute(path) ? path : resolve(root, path);
  const candidate = relative(root, absolute);
  if (!candidate || candidate.startsWith("..") || isAbsolute(candidate)) {
    throw new Error(`path must be inside ${root}: ${path}`);
  }
  return candidate;
}

export async function readOptional(path: string): Promise<string | null> {
  return (await exists(path)) ? readFile(path, "utf8") : null;
}

export function summarizePlan(plan: ReconciliationPlan): Record<string, unknown> {
  return {
    blocked: plan.blocked,
    operations: plan.operations.map((operation) => ({
      kind: operation.identity.kind,
      source: operation.identity.source,
      name: operation.identity.name,
      alias: operation.alias,
      direction: operation.direction,
    })),
    conflicts: plan.conflicts.map((conflict) => ({
      id: conflict.id,
      reason: conflict.reason,
      resource: conflict.identity,
      alias: conflict.alias,
      scope: conflict.scope,
      affectedTargets: conflict.affectedTargets,
      allowedResolutions: conflict.allowedResolutions,
      base: conflict.base?.revision,
      current: conflict.current?.revision,
      desired: conflict.desired?.revision,
      detail: conflict.detail,
    })),
    losses: plan.losses,
  };
}

export function configWithResolvedLocalSources(
  config: HarnessConfig,
  resources: HarnessResource[],
): HarnessConfig {
  const localPath = (resource: HarnessResource): string | undefined => {
    const value = resource.value as { source?: string };
    if (!value.source?.startsWith("./") || !resource.provenance.file) return value.source;
    return resolve(dirname(resource.provenance.file), value.source);
  };
  const byKindAndName = new Map(
    resources.map((resource) => [`${resource.identity.kind}\0${resource.alias}`, resource]),
  );
  return {
    ...config,
    ...(config.plugins
      ? {
          plugins: config.plugins.map((plugin) => {
            const resource = byKindAndName.get(`plugin\0${plugin.name}`);
            return resource ? { ...plugin, source: localPath(resource) ?? plugin.source } : plugin;
          }),
        }
      : {}),
    ...(config.skills
      ? {
          skills: config.skills.map((skill) => {
            const resource = byKindAndName.get(`skill\0${skill.name}`);
            const source = resource ? localPath(resource) : skill.source;
            return source ? { ...skill, source } : skill;
          }),
        }
      : {}),
  };
}
