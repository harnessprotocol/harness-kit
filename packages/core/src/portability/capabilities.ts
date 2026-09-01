import type { CompileSurfaceId, SurfaceId } from "../types.js";
import { TARGETS } from "../adapters/target-metadata.js";
import { isCompileSurface } from "../surfaces/types.js";
import { SURFACES, getSurface } from "../surfaces/registry.js";
import type { SurfaceDescriptor } from "../surfaces/types.js";
import { HARNESS_RESOURCE_KINDS } from "./types.js";
import type {
  CapabilityLevel,
  HarnessResource,
  HarnessResourceKind,
  HarnessScope,
  LifecycleOperation,
  LossReport,
  TargetResourceCapability,
} from "./types.js";

export const PORTABLE_RESOURCE_KINDS: readonly HarnessResourceKind[] = HARNESS_RESOURCE_KINDS;

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

/**
 * Legacy compile-surface derivation, unchanged from the pre-re-key matrix.
 * These cell values are pinned byte-identical by the
 * `fixtures/legacy-capability-matrix.json` snapshot test — do not adjust
 * without a deliberate capability-policy change.
 */
function legacyCompileCapability(target: CompileSurfaceId, resource: HarnessResourceKind): TargetResourceCapability {
  const targetMeta = TARGETS.find((entry) => entry.id === target);
  if (!targetMeta) throw new Error(`Unknown compile target: ${target}`);
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
      capture = "source-only";
      apply = target === "claude-code" ? "source-only" : "translated";
      note = target === "claude-code"
        ? "plugin installation remains managed by the native marketplace"
        : "plugin-contained portable resources are translated individually";
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

function allLevels(level: CapabilityLevel): {
  operations: Record<LifecycleOperation, CapabilityLevel>;
  scopes: Record<HarnessScope, CapabilityLevel>;
} {
  return {
    operations: { capture: level, apply: level, reconcile: level, rollback: level },
    scopes: { organization: level, personal: level, project: level, session: level },
  };
}

/** Cell for a surface that captures a kind from a native store but cannot yet write it. */
function captureOnlyCapability(
  descriptor: SurfaceDescriptor,
  resource: HarnessResourceKind,
): TargetResourceCapability {
  const hasUserStore = descriptor.stores.some((s) => s.kind === resource && s.scope === "user");
  const hasProjectStore = descriptor.stores.some((s) => s.kind === resource && s.scope === "project");
  return {
    target: descriptor.id,
    resource,
    operations: { capture: "native", apply: "source-only", reconcile: "source-only", rollback: "source-only" },
    scopes: {
      organization: hasUserStore ? "native" : "source-only",
      personal: hasUserStore ? "native" : "source-only",
      project: hasProjectStore ? "native" : "source-only",
      session: "source-only",
    },
    note: "captured from the native store; write support (apply) arrives in M2",
  };
}

/**
 * One cell of the surfaces × kinds matrix. Derivation rules, in order:
 *
 * 1. A kind listed in the surface descriptor's `notApplicable` — the harness
 *    has no concept of it at all — is `not-applicable` for every operation
 *    and scope.
 * 2. The 8 legacy compile surfaces keep their pre-re-key cells verbatim
 *    (`legacyCompileCapability`), so compile/capture/apply/loss-report
 *    behavior for them is byte-identical to before the re-key.
 * 3. The remaining surfaces (claude-desktop, copilot-cli, pi) derive from
 *    the surface registry: a kind with at least one config store is
 *    `native` to capture (readers shipped in Tasks 7–8) and `source-only`
 *    to apply until write support lands in M2; a kind with no store — and
 *    not `notApplicable` — is `unsupported` (no locally managed store).
 */
function capabilityFor(target: SurfaceId, resource: HarnessResourceKind): TargetResourceCapability {
  const descriptor = getSurface(target); // throws on genuinely unknown ids
  if (descriptor.notApplicable.includes(resource)) {
    return {
      target,
      resource,
      ...allLevels("not-applicable"),
      note: "this harness has no concept of this resource kind",
    };
  }
  if (isCompileSurface(target)) return legacyCompileCapability(target, resource);
  if (descriptor.stores.some((s) => s.kind === resource)) {
    return captureOnlyCapability(descriptor, resource);
  }
  return {
    target,
    resource,
    ...allLevels("unsupported"),
    note: "unmanaged locally: this surface has no local store for this resource",
  };
}

/** Exhaustive: all 11 surfaces × every resource kind, with no implicit/unknown cell. */
export const TARGET_CAPABILITY_MATRIX: readonly TargetResourceCapability[] = SURFACES.flatMap((surface) =>
  PORTABLE_RESOURCE_KINDS.map((resource) => capabilityFor(surface.id, resource)),
);

export function getTargetCapability(
  target: SurfaceId,
  resource: HarnessResourceKind,
): TargetResourceCapability {
  const capability = TARGET_CAPABILITY_MATRIX.find(
    (entry) => entry.target === target && entry.resource === resource,
  );
  if (!capability) throw new Error(`capability matrix is incomplete for ${target}/${resource}`);
  return capability;
}

export function capabilityForResource(
  target: SurfaceId,
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
    "not-applicable": 4,
  };
  return rank[operationLevel] >= rank[scopeLevel] ? operationLevel : scopeLevel;
}

export function buildLossReport(
  target: SurfaceId,
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
              : capability === "not-applicable"
                ? matrix.note ?? "resource kind is not applicable to this target"
                : matrix.note ?? "operation is unsupported for this target",
        recoverable: capability !== "unsupported" && capability !== "not-applicable",
      },
    ];
  });
  return { target, losses, portable: losses.every((loss) => loss.recoverable) };
}

export function assertCapabilityMatrixComplete(): void {
  for (const target of SURFACES.map((entry) => entry.id)) {
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
