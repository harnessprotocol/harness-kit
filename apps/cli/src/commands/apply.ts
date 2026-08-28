import { resolve } from "node:path";
import { stringify } from "yaml";
import {
  applyFileTransaction,
  capabilityForResource,
  compile,
  computeFileHash,
  digestValue,
  nextPortabilityState,
  profileToResources,
  resourcesToProfile,
  writeLockFile,
  writePortabilityState,
} from "@harness-kit/core";
import type {
  HarnessResource,
  OwnershipFingerprint,
  ReconciliationConflict,
  ReconciliationOperation,
  ReconciliationPlan,
  ReconciliationResolution,
  TargetPlatform,
  TransactionFileChange,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import {
  buildReconciliationContext,
  configWithResolvedLocalSources,
  parseResolutions,
  readOptional,
  relativeInside,
  summarizePlan,
  timestamp,
} from "./portability-common.js";

interface ApplyFlags {
  organization?: string;
  personal?: string;
  session?: string;
  target?: string;
  resolve?: string[];
  adopt?: boolean;
  yes?: boolean;
  json?: boolean;
}

interface ApplyOptions {
  resourceKind?: HarnessResource["identity"]["kind"];
}

function key(resource: Pick<HarnessResource, "identity" | "alias">): string {
  return `${resource.identity.kind}\0${resource.alias}`;
}

function selectFinalResources(
  desired: HarnessResource[],
  operations: ReconciliationOperation[],
  conflicts: ReconciliationConflict[],
  resolutions: ReconciliationResolution[],
): HarnessResource[] {
  const selected = new Map(desired.map((resource) => [key(resource), resource]));
  for (const operation of operations) {
    const resource = operation.desired ?? operation.current ?? operation.base;
    if (!resource) continue;
    if (operation.direction === "capture-current") {
      if (operation.current) selected.set(key(resource), operation.current);
      else selected.delete(key(resource));
    } else if (operation.direction === "delete-native" || operation.direction === "delete-portable") {
      selected.delete(key(resource));
    } else if (operation.direction === "apply-desired" && operation.desired) {
      selected.set(key(resource), operation.desired);
    }
  }
  const byId = new Map(resolutions.map((resolution) => [resolution.conflictId, resolution.resolution]));
  for (const conflict of conflicts) {
    const resolution = byId.get(conflict.id);
    if (!resolution) continue;
    const candidate =
      resolution === "use-desired"
        ? conflict.desired
        : resolution === "use-base"
          ? conflict.base
          : conflict.current;
    const resource = candidate ?? conflict.desired ?? conflict.current ?? conflict.base;
    if (!resource) continue;
    if (candidate) selected.set(key(resource), candidate);
    else selected.delete(key(resource));
  }
  return [...selected.values()];
}

function projectProfileAfterCaptures(
  projectResources: HarnessResource[],
  operations: ReconciliationOperation[],
  conflicts: ReconciliationConflict[],
  resolutions: ReconciliationResolution[],
): HarnessResource[] | null {
  const selected = new Map(projectResources.map((resource) => [key(resource), resource]));
  let changed = false;
  const capture = (resource: HarnessResource | undefined) => {
    if (!resource) return;
    selected.set(key(resource), { ...resource, scope: "project" });
    changed = true;
  };
  for (const operation of operations) {
    if (operation.direction === "capture-current") capture(operation.current);
    if (operation.direction === "delete-portable" && operation.desired?.scope === "project") {
      selected.delete(key(operation.desired));
      changed = true;
    }
  }
  const byId = new Map(resolutions.map((resolution) => [resolution.conflictId, resolution.resolution]));
  for (const conflict of conflicts) {
    if (byId.get(conflict.id) === "use-current") capture(conflict.current);
  }
  return changed ? [...selected.values()] : null;
}

async function planNativeFiles(
  root: string,
  targets: TargetPlatform[],
  resources: HarnessResource[],
  adopt: boolean,
): Promise<{ changes: TransactionFileChange[]; ownership: OwnershipFingerprint[]; warnings: string[] }> {
  const fs = new NodeFsProvider(root);
  const byPath = new Map<string, { content: string; targets: Set<TargetPlatform>; slot: string }>();
  const warnings: string[] = [];

  for (const target of targets) {
    const deployable = resources.filter((resource) => {
      const level = capabilityForResource(target, resource, "apply");
      return level === "native" || level === "translated";
    });
    const profile = resourcesToProfile(deployable, {
      metadata: { name: "resolved", description: "Resolved layered harness profile." },
      scope: "project",
    });
    const compileConfig = configWithResolvedLocalSources(profile, deployable);
    const result = await compile(stringify(compileConfig, { lineWidth: 0 }), [target], fs, {
      dryRun: true,
      force: true,
    });
    warnings.push(...result.warnings, ...result.skippedPlugins);
    for (const file of result.files) {
      if (file.action === "needs-confirmation" && !adopt) {
        throw new Error(`${file.path} is unowned or user-modified; preview it and re-run with --adopt to claim it`);
      }
      if (file.action === "skip") continue;
      const existing = byPath.get(file.path);
      if (existing && existing.content !== file.content) {
        throw new Error(`targets disagree on shared native file ${file.path}; apply them separately`);
      }
      if (existing) existing.targets.add(target);
      else byPath.set(file.path, { content: file.content, targets: new Set([target]), slot: file.slot });
    }
  }

  const changes: TransactionFileChange[] = [];
  const ownership: OwnershipFingerprint[] = [];
  for (const [path, file] of byPath) {
    const before = await readOptional(resolve(root, path));
    if (before !== file.content) changes.push({ path, before, after: file.content });
    for (const target of file.targets) {
      ownership.push({
        path,
        target,
        slot: file.slot,
        digest: `sha256:${computeFileHash(file.content)}`,
        managed: true,
      });
    }
  }
  return { changes, ownership, warnings };
}

function filterPlan(plan: ReconciliationPlan, kind: HarnessResource["identity"]["kind"]): ReconciliationPlan {
  const operations = plan.operations.filter((operation) => operation.identity.kind === kind);
  const conflicts = plan.conflicts.filter((conflict) => conflict.identity.kind === kind);
  const losses = plan.losses.map((report) => {
    const filtered = report.losses.filter((loss) => loss.resource.kind === kind);
    return { ...report, losses: filtered, portable: filtered.every((loss) => loss.recoverable) };
  });
  return {
    operations,
    conflicts,
    losses,
    blocked: conflicts.length > 0 || losses.some((report) => !report.portable),
  };
}

export async function applyCommand(path: string, flags: ApplyFlags, options: ApplyOptions = {}): Promise<void> {
  const context = await buildReconciliationContext(path, flags);
  const resolutions = parseResolutions(flags.resolve);
  const plan = options.resourceKind ? filterPlan(context.plan, options.resourceKind) : context.plan;
  const initialConflicts = options.resourceKind
    ? context.initialPlan.conflicts.filter((conflict) => conflict.identity.kind === options.resourceKind)
    : context.initialPlan.conflicts;
  const desired = options.resourceKind
    ? context.desired.filter((resource) => resource.identity.kind === options.resourceKind)
    : context.desired;
  if (plan.blocked) {
    const unresolved = plan.conflicts.map((conflict) => conflict.id).join(", ");
    throw new Error(`apply is blocked${unresolved ? ` by unresolved conflicts: ${unresolved}` : " by unsupported losses"}`);
  }

  const resources = selectFinalResources(
    desired,
    plan.operations,
    initialConflicts,
    resolutions,
  );
  const native = await planNativeFiles(context.root, context.targets, resources, Boolean(flags.adopt));
  const plannedPaths = new Set(native.ownership.map((entry) => entry.path));
  const ownedInScope = options.resourceKind === "skill"
    ? context.state.ownership.filter((owned) => owned.slot === "skills")
    : context.state.ownership;
  for (const owned of ownedInScope) {
    if (plannedPaths.has(owned.path)) continue;
    const before = await readOptional(resolve(context.root, owned.path));
    if (before === null) continue;
    if (`sha256:${computeFileHash(before)}` !== owned.digest) {
      throw new Error(`refusing to remove user-modified managed file ${owned.path}`);
    }
    native.changes.push({ path: owned.path, before, after: null });
  }

  const applyTimestamp = timestamp();
  const manifestPath = `.harness/backups/${applyTimestamp}/transaction.json`;
  const scopedPersistentResources = resources.filter((resource) => resource.scope !== "session");
  const persistentResources = options.resourceKind
    ? [
        ...context.state.lastApplied.filter((resource) => resource.identity.kind !== options.resourceKind),
        ...scopedPersistentResources,
      ]
    : scopedPersistentResources;
  const ownership = options.resourceKind === "skill"
    ? [...context.state.ownership.filter((owned) => owned.slot !== "skills"), ...native.ownership]
    : native.ownership;
  const nextState = nextPortabilityState(
    context.state,
    persistentResources,
    ownership,
    new Date().toISOString(),
    manifestPath,
  );
  native.changes.push({
    path: ".harness/state.json",
    before: await readOptional(resolve(context.root, ".harness/state.json")),
    after: writePortabilityState(nextState),
  });
  native.changes.push({
    path: "harness.lock",
    before: await readOptional(resolve(context.root, "harness.lock")),
    after: writeLockFile({
      version: 2,
      plugins: [],
      resources: persistentResources.map((resource) => ({
        kind: resource.identity.kind,
        name: resource.identity.name,
        source: resource.identity.source,
        ...(resource.revision?.requestedVersion ? { version: resource.revision.requestedVersion } : {}),
        ...(resource.revision?.resolvedRevision ? { revision: resource.revision.resolvedRevision } : {}),
        digest: resource.revision?.digest ?? digestValue(resource.value),
        alias: resource.alias,
      })),
    }),
  });

  const projectResources = profileToResources(context.projectProfile);
  const capturedProjectResources = projectProfileAfterCaptures(
    projectResources,
    plan.operations,
    initialConflicts,
    resolutions,
  );
  if (capturedProjectResources) {
    const projectConfig = resourcesToProfile(capturedProjectResources, {
      metadata: context.projectProfile.config.metadata ?? {
        name: "project",
        description: "Project harness profile.",
      },
      scope: "project",
    });
    const projectPath = context.projectProfile.source!;
    native.changes.push({
      path: relativeInside(context.root, projectPath),
      before: await readOptional(projectPath),
      after: stringify(projectConfig, { lineWidth: 0 }),
    });
  }

  const preview = {
    ...summarizePlan(plan),
    files: native.changes.map((change) => ({
      path: change.path,
      action: change.after === null ? "remove" : change.before === null ? "create" : "update",
    })),
    warnings: native.warnings,
    approvalRequired: !flags.yes,
  };
  if (flags.json) console.log(JSON.stringify(preview, null, 2));
  else {
    console.log(`Apply preview: ${native.changes.length} file change(s) across ${context.targets.length} target(s).`);
    for (const change of preview.files) console.log(`  ${change.action.padEnd(7)} ${change.path}`);
    for (const warning of native.warnings) console.log(`  WARNING ${warning}`);
    if (!flags.yes) console.log("Preview only. Re-run with --yes to apply transactionally.");
  }
  if (!flags.yes) return;

  const fs = new NodeFsProvider(context.root);
  const result = await applyFileTransaction(native.changes, { fs, timestamp: applyTimestamp });
  if (!result.committed) throw new Error(result.error ?? "apply transaction failed");
  if (!flags.json) console.log(`Applied successfully. Roll back with: harness-kit rollback --transaction ${result.manifestPath} --yes`);
}
