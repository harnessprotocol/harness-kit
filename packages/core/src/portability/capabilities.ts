import type { TargetPlatform } from "../types.js";
import { TARGETS } from "../adapters/target-metadata.js";
import type {
  CapabilityLevel,
  HarnessResource,
  HarnessResourceKind,
  HarnessScope,
  LifecycleOperation,
  LossReport,
  TargetResourceCapability,
} from "./types.js";

export const PORTABLE_RESOURCE_KINDS: readonly HarnessResourceKind[] = [
  "plugin",
  "skill",
  "mcp-server",
  "env",
  "instructions",
  "permissions",
  "architectural-constraints",
  "policy",
  "extends",
  "native-extension",
] as const;

const ALL_OPERATIONS: readonly LifecycleOperation[] = ["capture", "apply", "reconcile", "rollback"];
const ALL_SCOPES: readonly HarnessScope[] = ["organization", "personal", "project", "session"];

function operationRecord(
  capture: CapabilityLevel,
  apply: CapabilityLevel,
): Record<LifecycleOperation, CapabilityLevel> {
  return {
    capture,
    apply,
    reconcile: apply === "unsupported" && capture === "unsupported" ? "unsupported" : "native",
    rollback: apply === "unsupported" ? "source-only" : "native",
  };
}

function scopeRecord(project: CapabilityLevel, personal: CapabilityLevel = "translated"): Record<HarnessScope, CapabilityLevel> {
  return {
    organization: personal,
    personal,
    project,
    session: project === "unsupported" ? "unsupported" : "source-only",
  };
}

function capabilityFor(target: TargetPlatform, resource: HarnessResourceKind): TargetResourceCapability {
  const targetMeta = TARGETS.find((entry) => entry.id === target)!;
  let capture: CapabilityLevel = "source-only";
  let apply: CapabilityLevel = "source-only";
  let note: string | undefined;

  switch (resource) {
    case "instructions":
      capture = "native";
      apply = "native";
      break;
    case "skill":
      capture = "native";
      apply = "native";
      break;
    case "plugin":
      capture = target === "claude-code" ? "native" : "source-only";
      apply = target === "claude-code" ? "native" : "translated";
      note = target === "claude-code" ? undefined : "plugin-contained portable resources are translated individually";
      break;
    case "mcp-server":
      capture = targetMeta.mcpConfigFile ? "native" : "source-only";
      apply = targetMeta.mcpConfigFile ? "native" : "source-only";
      note = targetMeta.mcpConfigFile ? undefined : "no project-scoped native MCP file is managed for this target";
      break;
    case "permissions":
      capture = target === "claude-code" ? "native" : "source-only";
      apply = target === "claude-code" ? "native" : "translated";
      note = target === "claude-code" ? undefined : "permission intent is preserved in instructions when native enforcement is unavailable";
      break;
    case "architectural-constraints":
      capture = "source-only";
      apply = "translated";
      note = "constraints compile into portable agent instructions";
      break;
    case "env":
      capture = "source-only";
      apply = "source-only";
      note = "only declarations and provider references are portable; values remain local";
      break;
    case "policy":
    case "extends":
      capture = "source-only";
      apply = "source-only";
      note = "Harness Kit resolves this resource before native export";
      break;
    case "native-extension":
      capture = "source-only";
      apply = "source-only";
      note = "native extension blocks only apply to their originating target";
      break;
  }

  return {
    target,
    resource,
    operations: operationRecord(capture, apply),
    scopes: scopeRecord(apply, resource === "skill" ? "native" : "translated"),
    ...(note ? { note } : {}),
  };
}

/** Exhaustive: 8 targets × every resource kind, with no implicit/unknown cell. */
export const TARGET_CAPABILITY_MATRIX: readonly TargetResourceCapability[] = TARGETS.flatMap((target) =>
  PORTABLE_RESOURCE_KINDS.map((resource) => capabilityFor(target.id, resource)),
);

export function getTargetCapability(
  target: TargetPlatform,
  resource: HarnessResourceKind,
): TargetResourceCapability {
  const capability = TARGET_CAPABILITY_MATRIX.find(
    (entry) => entry.target === target && entry.resource === resource,
  );
  if (!capability) throw new Error(`capability matrix is incomplete for ${target}/${resource}`);
  return capability;
}

export function capabilityForResource(
  target: TargetPlatform,
  resource: HarnessResource,
  operation: LifecycleOperation,
): CapabilityLevel {
  if (resource.identity.kind === "native-extension") {
    return resource.nativeTarget === target ? "native" : "source-only";
  }
  const capability = getTargetCapability(target, resource.identity.kind);
  const operationLevel = capability.operations[operation];
  const scopeLevel = capability.scopes[resource.scope];
  const rank: Record<CapabilityLevel, number> = {
    native: 0,
    translated: 1,
    "source-only": 2,
    unsupported: 3,
  };
  return rank[operationLevel] >= rank[scopeLevel] ? operationLevel : scopeLevel;
}

export function buildLossReport(
  target: TargetPlatform,
  resources: HarnessResource[],
  operation: LifecycleOperation,
): LossReport {
  const losses = resources.flatMap((resource) => {
    const capability = capabilityForResource(target, resource, operation);
    if (capability === "native") return [];
    const matrix = getTargetCapability(target, resource.identity.kind);
    return [
      {
        resource: resource.identity,
        target,
        operation,
        capability,
        detail:
          capability === "translated"
            ? matrix.note ?? "resource is translated into the closest native representation"
            : capability === "source-only"
              ? matrix.note ?? "resource remains in portable state but is not emitted natively"
              : matrix.note ?? "operation is unsupported for this target",
        recoverable: capability !== "unsupported",
      },
    ];
  });
  return { target, losses, portable: losses.every((loss) => loss.recoverable) };
}

export function assertCapabilityMatrixComplete(): void {
  for (const target of TARGETS.map((entry) => entry.id)) {
    for (const resource of PORTABLE_RESOURCE_KINDS) {
      const capability = getTargetCapability(target, resource);
      for (const operation of ALL_OPERATIONS) {
        if (!capability.operations[operation]) {
          throw new Error(`missing operation capability for ${target}/${resource}/${operation}`);
        }
      }
      for (const scope of ALL_SCOPES) {
        if (!capability.scopes[scope]) {
          throw new Error(`missing scope capability for ${target}/${resource}/${scope}`);
        }
      }
    }
  }
}
