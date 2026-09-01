import { computeFileHash } from "../compile/check.js";
import { isProtocolV2 } from "../utils/legacy.js";
import { CURRENT_PROTOCOL_VERSION } from "../utils/protocol-version.js";
import type {
  EnvDeclaration,
  HarnessConfig,
  HarnessMetadata,
  HarnessPlugin,
  HarnessSkillRef,
  McpServer,
  SurfaceId,
} from "../types.js";
import type {
  HarnessResource,
  HarnessResourceKind,
  HarnessScope,
  LayeredHarnessProfile,
  ReleaseDigest,
  ResourceIdentity,
} from "./types.js";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = stableValue(child);
    }
    return result;
  }
  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function digestValue(value: unknown): ReleaseDigest {
  return `sha256:${computeFileHash(stableSerialize(value))}`;
}

export function resourceIdentityKey(identity: ResourceIdentity): string {
  return `${identity.kind}\u0000${identity.source}\u0000${identity.name}`;
}

export function resourceAliasKey(resource: Pick<HarnessResource, "identity" | "alias">): string {
  return `${resource.identity.kind}\u0000${resource.alias}`;
}

export function resourcesEqual(a: HarnessResource | undefined, b: HarnessResource | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    resourceIdentityKey(a.identity) === resourceIdentityKey(b.identity) &&
    a.alias === b.alias &&
    stableSerialize(a.value) === stableSerialize(b.value) &&
    stableSerialize(a.revision) === stableSerialize(b.revision) &&
    a.nativeTarget === b.nativeTarget
  );
}

function makeResource<T>(
  kind: HarnessResourceKind,
  name: string,
  source: string,
  value: T,
  scope: HarnessScope,
  profileSource: string,
  revision?: { requestedVersion?: string; digest?: ReleaseDigest },
  nativeTarget?: SurfaceId,
): HarnessResource<T> {
  return {
    identity: { kind, source, name },
    alias: name,
    scope,
    value,
    provenance: { scope, file: profileSource },
    ...(revision
      ? {
          revision: {
            source,
            ...(revision.requestedVersion ? { requestedVersion: revision.requestedVersion } : {}),
            ...(revision.digest ? { digest: revision.digest } : {}),
          },
        }
      : {}),
    ...(nativeTarget ? { nativeTarget } : {}),
  };
}

function shaIntegrity(value: unknown): ReleaseDigest | undefined {
  const integrity = (value as { integrity?: { sha256?: unknown } } | null)?.integrity;
  return typeof integrity?.sha256 === "string" ? `sha256:${integrity.sha256}` : undefined;
}

/** Project a human-readable harness profile into generic reconciler resources. */
export function profileToResources(profile: LayeredHarnessProfile): HarnessResource[] {
  const { config, scope } = profile;
  const profileSource = profile.source ?? config.metadata?.name ?? "harness.yaml";
  const localSource = `profile:${profileSource}`;
  const resources: HarnessResource[] = [];

  for (const plugin of config.plugins ?? []) {
    resources.push(
      makeResource(
        "plugin",
        plugin.name,
        plugin.source,
        plugin,
        scope,
        profileSource,
        { requestedVersion: plugin.version, digest: shaIntegrity(plugin) },
      ),
    );
  }

  for (const skill of config.skills ?? []) {
    const source = skill.source ?? localSource;
    resources.push(
      makeResource(
        "skill",
        skill.name,
        source,
        skill,
        scope,
        profileSource,
        { requestedVersion: skill.version, digest: shaIntegrity(skill) },
      ),
    );
  }

  for (const [name, server] of Object.entries(config["mcp-servers"] ?? {})) {
    const source = server.source ?? localSource;
    resources.push(
      makeResource(
        "mcp-server",
        name,
        source,
        server,
        scope,
        profileSource,
        { requestedVersion: server.version, digest: shaIntegrity(server) },
      ),
    );
  }

  for (const declaration of config.env ?? []) {
    resources.push(makeResource("env", declaration.name, localSource, declaration, scope, profileSource));
  }

  if (config.instructions) {
    resources.push(
      makeResource("instructions", "instructions", localSource, config.instructions, scope, profileSource),
    );
  }
  if (config.permissions) {
    resources.push(
      makeResource("permissions", "permissions", localSource, config.permissions, scope, profileSource),
    );
  }
  if (config["architectural-constraints"]) {
    resources.push(
      makeResource(
        "architectural-constraints",
        "architectural-constraints",
        localSource,
        config["architectural-constraints"],
        scope,
        profileSource,
      ),
    );
  }
  if (config.policy) {
    resources.push(makeResource("policy", "policy", localSource, config.policy, scope, profileSource));
  }
  for (const parent of config.extends ?? []) {
    resources.push(
      makeResource(
        "extends",
        parent.source,
        parent.source,
        parent,
        scope,
        profileSource,
        { requestedVersion: parent.version },
      ),
    );
  }
  for (const [target, native] of Object.entries(config.vendor ?? {})) {
    resources.push(
      makeResource(
        "native-extension",
        target,
        localSource,
        native,
        scope,
        profileSource,
        undefined,
        target as SurfaceId,
      ),
    );
  }

  return resources;
}

export interface ResourcesToProfileOptions {
  metadata: HarnessMetadata;
  scope?: HarnessScope;
}

/** Reconstruct a v2 profile after conflicts have been resolved. */
export function resourcesToProfile(
  resources: HarnessResource[],
  options: ResourcesToProfileOptions,
): HarnessConfig {
  const config: HarnessConfig = {
    $schema: "https://harnessprotocol.io/schema/v2/harness.schema.json",
    version: CURRENT_PROTOCOL_VERSION,
    kind: "profile",
    metadata: options.metadata,
    scope: options.scope ?? "project",
  };

  const plugins: HarnessPlugin[] = [];
  const skills: HarnessSkillRef[] = [];
  const servers: Record<string, McpServer> = {};
  const env: EnvDeclaration[] = [];
  const vendor: Partial<Record<SurfaceId, Record<string, unknown>>> = {};
  const parents: Array<{ source: string; version?: string }> = [];

  for (const resource of resources) {
    switch (resource.identity.kind) {
      case "plugin":
        plugins.push(resource.value as HarnessPlugin);
        break;
      case "skill":
        skills.push(resource.value as HarnessSkillRef);
        break;
      case "mcp-server":
        servers[resource.alias] = resource.value as McpServer;
        break;
      case "env":
        env.push(resource.value as EnvDeclaration);
        break;
      case "instructions":
        config.instructions = resource.value as HarnessConfig["instructions"];
        break;
      case "permissions":
        config.permissions = resource.value as HarnessConfig["permissions"];
        break;
      case "architectural-constraints":
        config["architectural-constraints"] = resource.value as HarnessConfig["architectural-constraints"];
        break;
      case "policy":
        config.policy = resource.value as HarnessConfig["policy"];
        break;
      case "extends":
        parents.push(resource.value as { source: string; version?: string });
        break;
      case "native-extension":
        if (resource.nativeTarget) {
          vendor[resource.nativeTarget] = resource.value as Record<string, unknown>;
        }
        break;
    }
  }

  if (plugins.length) config.plugins = plugins.sort((a, b) => a.name.localeCompare(b.name));
  if (skills.length) config.skills = skills.sort((a, b) => a.name.localeCompare(b.name));
  if (Object.keys(servers).length) {
    config["mcp-servers"] = Object.fromEntries(
      Object.entries(servers).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  if (env.length) config.env = env.sort((a, b) => a.name.localeCompare(b.name));
  if (parents.length) config.extends = parents.sort((a, b) => a.source.localeCompare(b.source));
  if (Object.keys(vendor).length) config.vendor = vendor;

  return config;
}

export interface MigrationPreview {
  config: HarnessConfig;
  changes: string[];
}

/** Preview a v1 → v2 migration. A config already in the v2 family ("2" or "2.1") is returned by reference, unchanged. */
export function migrateHarnessV1ToV2(config: HarnessConfig): MigrationPreview {
  if (isProtocolV2(config.version)) return { config, changes: [] };
  return {
    config: {
      ...config,
      $schema: "https://harnessprotocol.io/schema/v2/harness.schema.json",
      version: "2",
      scope: config.scope ?? "project",
    },
    changes: [
      "set protocol version to 2",
      `set profile scope to ${config.scope ?? "project"}`,
      "preserve every existing v1 section unchanged",
    ],
  };
}
