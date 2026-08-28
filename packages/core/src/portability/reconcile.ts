import type { TargetPlatform } from "../types.js";
import { buildLossReport } from "./capabilities.js";
import { resourceAliasKey, resourcesEqual } from "./resource-model.js";
import type {
  HarnessResource,
  ReconciliationConflict,
  ReconciliationOperation,
  ReconciliationPlan,
  ReconciliationResolution,
} from "./types.js";

export interface ReconcileResourcesInput {
  base: HarnessResource[];
  current: HarnessResource[];
  desired: HarnessResource[];
  targets: TargetPlatform[];
  conflicts?: ReconciliationConflict[];
}

function index(resources: HarnessResource[]): Map<string, HarnessResource> {
  return new Map(resources.map((resource) => [resourceAliasKey(resource), resource]));
}

function operation(
  direction: ReconciliationOperation["direction"],
  base: HarnessResource | undefined,
  current: HarnessResource | undefined,
  desired: HarnessResource | undefined,
): ReconciliationOperation {
  const resource = desired ?? current ?? base;
  if (!resource) throw new Error("cannot create a reconciliation operation without a resource");
  return {
    identity: resource.identity,
    alias: resource.alias,
    direction,
    ...(base ? { base } : {}),
    ...(current ? { current } : {}),
    ...(desired ? { desired } : {}),
  };
}

function conflict(
  key: string,
  base: HarnessResource | undefined,
  current: HarnessResource | undefined,
  desired: HarnessResource | undefined,
  targets: TargetPlatform[],
): ReconciliationConflict {
  const resource = desired ?? current ?? base;
  if (!resource) throw new Error("cannot create a reconciliation conflict without a resource");
  return {
    id: `divergent-change:${key.replace(/\u0000/g, ":")}`,
    identity: resource.identity,
    alias: resource.alias,
    scope: resource.scope,
    reason: "divergent-change",
    ...(base ? { base } : {}),
    ...(current ? { current } : {}),
    ...(desired ? { desired } : {}),
    affectedTargets: targets,
    allowedResolutions: ["use-current", "use-desired", ...(base ? (["use-base"] as const) : []), "skip"],
    detail: base
      ? "native and portable peers both changed differently since the last applied revision"
      : "native and portable peers introduced different resources with the same deployment alias",
  };
}

/** Pure three-way reconciliation. No operation silently wins a divergent edit. */
export function reconcileResources(input: ReconcileResourcesInput): ReconciliationPlan {
  const base = index(input.base);
  const current = index(input.current);
  const desired = index(input.desired);
  const keys = [...new Set([...base.keys(), ...current.keys(), ...desired.keys()])].sort();
  const operations: ReconciliationOperation[] = [];
  const conflicts: ReconciliationConflict[] = [...(input.conflicts ?? [])];

  for (const key of keys) {
    const before = base.get(key);
    const native = current.get(key);
    const portable = desired.get(key);

    if (resourcesEqual(native, portable)) {
      operations.push(operation("noop", before, native, portable));
      continue;
    }

    if (!before) {
      if (native && !portable) operations.push(operation("capture-current", undefined, native, undefined));
      else if (!native && portable) operations.push(operation("apply-desired", undefined, undefined, portable));
      else conflicts.push(conflict(key, undefined, native, portable, input.targets));
      continue;
    }

    const nativeUnchanged = resourcesEqual(before, native);
    const portableUnchanged = resourcesEqual(before, portable);

    if (nativeUnchanged && !portableUnchanged) {
      operations.push(
        operation(portable ? "apply-desired" : "delete-native", before, native, portable),
      );
      continue;
    }

    if (portableUnchanged && !nativeUnchanged) {
      operations.push(
        operation(native ? "capture-current" : "delete-portable", before, native, portable),
      );
      continue;
    }

    if (!native && !portable) {
      operations.push(operation("noop", before, undefined, undefined));
      continue;
    }

    conflicts.push(conflict(key, before, native, portable, input.targets));
  }

  const resourcesToApply = operations
    .filter((entry) => entry.direction === "apply-desired" || entry.direction === "delete-native")
    .flatMap((entry) => (entry.desired ? [entry.desired] : entry.base ? [entry.base] : []));
  const losses = input.targets.map((target) => buildLossReport(target, resourcesToApply, "apply"));

  return {
    operations,
    conflicts,
    losses,
    blocked: conflicts.length > 0 || losses.some((report) => !report.portable),
  };
}

export function resolveReconciliationPlan(
  plan: ReconciliationPlan,
  resolutions: ReconciliationResolution[],
): ReconciliationPlan {
  const byId = new Map(resolutions.map((entry) => [entry.conflictId, entry.resolution]));
  const unresolved: ReconciliationConflict[] = [];
  const operations = [...plan.operations];

  for (const item of plan.conflicts) {
    const resolution = byId.get(item.id);
    if (!resolution) {
      unresolved.push(item);
      continue;
    }
    if (!item.allowedResolutions.includes(resolution)) {
      throw new Error(`resolution '${resolution}' is not allowed for conflict '${item.id}'`);
    }
    if (resolution === "skip") continue;
    if (resolution === "use-current") {
      operations.push(operation("capture-current", item.base, item.current, item.desired));
    } else if (resolution === "use-desired") {
      operations.push(operation("apply-desired", item.base, item.current, item.desired));
    } else {
      const base = item.base;
      if (!base) throw new Error(`conflict '${item.id}' has no base revision`);
      operations.push(operation("apply-desired", base, item.current, base));
    }
  }

  return {
    ...plan,
    operations,
    conflicts: unresolved,
    blocked: unresolved.length > 0 || plan.losses.some((report) => !report.portable),
  };
}
