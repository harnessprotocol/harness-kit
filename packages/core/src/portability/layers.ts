import type { HarnessPolicy, PolicySourceConstraint, TargetPlatform } from "../types.js";
import {
  HARNESS_SCOPE_ORDER,
  type HarnessResource,
  type LayeredHarnessProfile,
  type LayerResolutionResult,
  type PolicyViolation,
  type ReconciliationConflict,
} from "./types.js";
import {
  profileToResources,
  resourceAliasKey,
  resourceIdentityKey,
  resourcesEqual,
  stableSerialize,
} from "./resource-model.js";

function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function matchesAny(patterns: string[] | undefined, value: string): boolean {
  return patterns === undefined || patterns.some((pattern) => wildcardMatch(pattern, value));
}

function deniedBy(patterns: string[] | undefined, value: string): boolean {
  return Boolean(patterns?.some((pattern) => wildcardMatch(pattern, value)));
}

function union(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  if (!a && !b) return undefined;
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

function narrowAllowed(parent: string[] | undefined, child: string[] | undefined): string[] | undefined {
  if (!parent) return child;
  if (!child) return parent;
  return child.filter((candidate) => parent.some((pattern) => wildcardMatch(pattern, candidate)));
}

function mergeSourceConstraint(
  parent: PolicySourceConstraint | undefined,
  child: PolicySourceConstraint | undefined,
): PolicySourceConstraint | undefined {
  if (!parent && !child) return undefined;
  return {
    ...(narrowAllowed(parent?.["allowed-sources"], child?.["allowed-sources"])
      ? { "allowed-sources": narrowAllowed(parent?.["allowed-sources"], child?.["allowed-sources"]) }
      : {}),
    ...(union(parent?.["denied-sources"], child?.["denied-sources"])
      ? { "denied-sources": union(parent?.["denied-sources"], child?.["denied-sources"]) }
      : {}),
  };
}

/** Merge policies so every child may narrow, but never widen, its parent. */
export function mergePolicyCeilings(parent: HarnessPolicy | undefined, child: HarnessPolicy | undefined): HarnessPolicy | undefined {
  if (!parent && !child) return undefined;
  const pluginSources = mergeSourceConstraint(parent?.plugins, child?.plugins);
  const result: HarnessPolicy = {
    ...(mergeSourceConstraint(parent?.["mcp-servers"], child?.["mcp-servers"])
      ? { "mcp-servers": mergeSourceConstraint(parent?.["mcp-servers"], child?.["mcp-servers"]) }
      : {}),
    ...(pluginSources
      ? {
          plugins: {
            ...pluginSources,
            ...(narrowAllowed(parent?.plugins?.["allowed-marketplaces"], child?.plugins?.["allowed-marketplaces"])
              ? {
                  "allowed-marketplaces": narrowAllowed(
                    parent?.plugins?.["allowed-marketplaces"],
                    child?.plugins?.["allowed-marketplaces"],
                  ),
                }
              : {}),
          },
        }
      : {}),
    ...(mergeSourceConstraint(parent?.skills, child?.skills)
      ? { skills: mergeSourceConstraint(parent?.skills, child?.skills) }
      : {}),
    ...((parent?.permissions || child?.permissions)
      ? {
          permissions: {
            ...((parent?.permissions?.tools || child?.permissions?.tools)
              ? {
                  tools: {
                    ...(narrowAllowed(parent?.permissions?.tools?.allow, child?.permissions?.tools?.allow)
                      ? { allow: narrowAllowed(parent?.permissions?.tools?.allow, child?.permissions?.tools?.allow) }
                      : {}),
                    ...(union(parent?.permissions?.tools?.deny, child?.permissions?.tools?.deny)
                      ? { deny: union(parent?.permissions?.tools?.deny, child?.permissions?.tools?.deny) }
                      : {}),
                  },
                }
              : {}),
            ...((parent?.permissions?.network || child?.permissions?.network)
              ? {
                  network: {
                    ...(narrowAllowed(
                      parent?.permissions?.network?.["allowed-hosts"],
                      child?.permissions?.network?.["allowed-hosts"],
                    )
                      ? {
                          "allowed-hosts": narrowAllowed(
                            parent?.permissions?.network?.["allowed-hosts"],
                            child?.permissions?.network?.["allowed-hosts"],
                          ),
                        }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    "require-integrity": Boolean(parent?.["require-integrity"] || child?.["require-integrity"]),
  };
  return result;
}

function sourceConstraintFor(resource: HarnessResource, policy: HarnessPolicy): PolicySourceConstraint | undefined {
  if (resource.identity.kind === "skill") return policy.skills;
  if (resource.identity.kind === "plugin") return policy.plugins;
  if (resource.identity.kind === "mcp-server") return policy["mcp-servers"];
  return undefined;
}

export function evaluatePolicy(resource: HarnessResource, policy: HarnessPolicy | undefined): PolicyViolation[] {
  if (!policy) return [];
  const violations: PolicyViolation[] = [];
  const constraint = sourceConstraintFor(resource, policy);
  if (constraint) {
    if (!matchesAny(constraint["allowed-sources"], resource.identity.source)) {
      violations.push({
        resource: resource.identity,
        rule: "allowed-sources",
        detail: `source '${resource.identity.source}' is outside the organization allowlist`,
        policyScope: "organization",
      });
    }
    if (deniedBy(constraint["denied-sources"], resource.identity.source)) {
      violations.push({
        resource: resource.identity,
        rule: "denied-sources",
        detail: `source '${resource.identity.source}' is denied by organization policy`,
        policyScope: "organization",
      });
    }
  }

  if (
    policy["require-integrity"] &&
    ["skill", "plugin", "mcp-server"].includes(resource.identity.kind) &&
    !resource.revision?.digest
  ) {
    violations.push({
      resource: resource.identity,
      rule: "require-integrity",
      detail: "organization policy requires a resolved content digest",
      policyScope: "organization",
    });
  }

  if (resource.identity.kind === "permissions") {
    const value = resource.value as {
      tools?: { allow?: string[] };
      network?: { "allowed-hosts"?: string[] };
    };
    for (const tool of value.tools?.allow ?? []) {
      if (deniedBy(policy.permissions?.tools?.deny, tool) || !matchesAny(policy.permissions?.tools?.allow, tool)) {
        violations.push({
          resource: resource.identity,
          rule: "permissions.tools",
          detail: `tool permission '${tool}' widens the organization ceiling`,
          policyScope: "organization",
        });
      }
    }
    for (const host of value.network?.["allowed-hosts"] ?? []) {
      if (!matchesAny(policy.permissions?.network?.["allowed-hosts"], host)) {
        violations.push({
          resource: resource.identity,
          rule: "permissions.network",
          detail: `network host '${host}' widens the organization ceiling`,
          policyScope: "organization",
        });
      }
    }
  }

  return violations;
}

function conflictId(reason: string, resource: HarnessResource): string {
  return `${reason}:${resource.identity.kind}:${resource.alias}:${resource.scope}`;
}

export function resolveProfileLayers(
  profiles: LayeredHarnessProfile[],
  affectedTargets: TargetPlatform[] = [],
): LayerResolutionResult {
  const ordered = [...profiles].sort(
    (a, b) => HARNESS_SCOPE_ORDER.indexOf(a.scope) - HARNESS_SCOPE_ORDER.indexOf(b.scope),
  );

  let policy: HarnessPolicy | undefined;
  for (const profile of ordered) policy = mergePolicyCeilings(policy, profile.config.policy);

  const active = new Map<string, HarnessResource>();
  const shadowed: HarnessResource[] = [];
  const conflicts: ReconciliationConflict[] = [];

  for (const profile of ordered) {
    for (const resource of profileToResources(profile)) {
      if (resource.identity.kind === "policy") continue;
      const aliasKey = resourceAliasKey(resource);
      const existing = active.get(aliasKey);
      if (!existing) {
        active.set(aliasKey, resource);
        continue;
      }

      if (existing.scope === resource.scope && !resourcesEqual(existing, resource)) {
        conflicts.push({
          id: conflictId("alias-collision", resource),
          identity: resource.identity,
          alias: resource.alias,
          scope: resource.scope,
          reason: "alias-collision",
          current: existing,
          desired: resource,
          affectedTargets,
          allowedResolutions: ["use-current", "use-desired", "skip"],
          detail: `two ${resource.identity.kind} resources at ${resource.scope} scope require the flat alias '${resource.alias}'`,
        });
        continue;
      }

      shadowed.push(existing);
      active.set(aliasKey, resource);
    }
  }

  const resources = [...active.values()].sort((a, b) =>
    resourceIdentityKey(a.identity).localeCompare(resourceIdentityKey(b.identity)),
  );
  const policyViolations = resources.flatMap((resource) => evaluatePolicy(resource, policy));

  for (const violation of policyViolations) {
    const resource = resources.find(
      (candidate) => resourceIdentityKey(candidate.identity) === resourceIdentityKey(violation.resource),
    );
    if (!resource) continue;
    conflicts.push({
      id: conflictId(`policy-${violation.rule}`, resource),
      identity: resource.identity,
      alias: resource.alias,
      scope: resource.scope,
      reason: "policy-violation",
      desired: resource,
      affectedTargets,
      allowedResolutions: ["skip"],
      detail: violation.detail,
    });
  }

  return { resources, shadowed, conflicts, policy, policyViolations };
}

export function layerFingerprint(result: LayerResolutionResult): string {
  return stableSerialize({
    resources: result.resources,
    policy: result.policy,
    conflicts: result.conflicts.map((conflict) => conflict.id),
  });
}
