import type { HarnessConfig, SurfaceId } from "../types.js";
import type {
  HarnessResource,
  InventorySnapshot,
  RedactionFinding,
} from "./types.js";
import { sanitizeCapturedSecrets } from "./secrets.js";

const SENSITIVE_KEY = /(api[-_]?key|token|secret|password|credential|authorization|cookie|private[-_]?key|access[-_]?key)/i;
const CREDENTIAL_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|:\/\/[^\s/:]+:[^\s/@]+@)/;
const OMITTED_INVENTORY_KEY = /^(?:raw|content|body|prompt|skillBodies|secretValues|environmentContents)$/i;

function inventoryProjection(config: HarnessConfig): Record<string, unknown> {
  const servers = Object.fromEntries(Object.entries(config["mcp-servers"] ?? {}).map(([name, server]) => [
    name,
    server.transport === "stdio"
      ? {
          transport: server.transport,
          command: server.command,
          ...(server.source ? { source: server.source } : {}),
          ...(server.version ? { version: server.version } : {}),
          ...(server.integrity ? { integrity: server.integrity } : {}),
        }
      : {
          transport: server.transport,
          url: server.url,
          ...(server.source ? { source: server.source } : {}),
          ...(server.version ? { version: server.version } : {}),
        },
  ]));
  const nativeState = Object.fromEntries(Object.entries(config.vendor ?? {}).map(([target, value]) => {
    if (!value || typeof value !== "object") return [target, { configured: true }];
    const block = value as {
      files?: Array<{ path?: string; digest?: string }>;
      settings?: Array<{ path?: string; digest?: string }>;
      omitted?: Array<{ path?: string; reason?: string }>;
    };
    return [target, {
      files: (block.files ?? []).map(({ path, digest }) => ({ path, digest })),
      settings: (block.settings ?? []).map(({ path, digest }) => ({ path, digest })),
      omitted: (block.omitted ?? []).map(({ path, reason }) => ({ path, reason })),
    }];
  }));

  return {
    version: config.version,
    ...(config.scope ? { scope: config.scope } : {}),
    ...(config.metadata?.name ? { metadata: { name: config.metadata.name } } : {}),
    plugins: (config.plugins ?? []).map(({ name, source, version, loading, integrity }) => ({
      name, source, ...(version ? { version } : {}), ...(loading ? { loading } : {}), ...(integrity ? { integrity } : {}),
    })),
    skills: (config.skills ?? []).map(({ name, source, version, enabled, loading, integrity }) => ({
      name, source, ...(version ? { version } : {}), ...(enabled !== undefined ? { enabled } : {}),
      ...(loading ? { loading } : {}), ...(integrity ? { integrity } : {}),
    })),
    "mcp-servers": servers,
    env: (config.env ?? []).map(({ name, required, sensitive, when }) => ({ name, required, sensitive, ...(when ? { when } : {}) })),
    instructions: {
      configured: Object.entries(config.instructions ?? {})
        .filter(([slot, content]) => slot !== "import-mode" && typeof content === "string" && content.length > 0)
        .map(([slot]) => slot),
      ...(config.instructions?.["import-mode"] ? { importMode: config.instructions["import-mode"] } : {}),
    },
    permissions: { configured: Object.keys(config.permissions ?? {}) },
    architecture: { configured: Object.keys(config["architectural-constraints"] ?? {}) },
    policy: { configured: Object.keys(config.policy ?? {}) },
    inheritance: (config.extends ?? []).map((entry) => entry.source),
    nativeState,
  };
}

function looksHighEntropy(value: string, path: string): boolean {
  if (/(digest|sha256|integrity|content-hash|revision)$/i.test(path)) return false;
  if (value.length < 32 || value.length > 512 || /\s/.test(value)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
  return classes >= 3;
}

function redactValue(
  value: unknown,
  path: string,
  findings: RedactionFinding[],
  schemaSensitive = false,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, `${path}[${index}]`, findings, schemaSensitive));
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const envDeclarationSensitive = object.sensitive !== false && typeof object.name === "string";
    for (const [key, child] of Object.entries(object)) {
      const childPath = path ? `${path}.${key}` : key;
      if (OMITTED_INVENTORY_KEY.test(key) || (path.startsWith("env[") && key === "default")) {
        findings.push({ path: childPath, reason: "schema-secret" });
        continue;
      }
      if (path === "effectiveConfig" && key === "instructions") {
        const instructions = child && typeof child === "object"
          ? child as Record<string, unknown>
          : {};
        result[key] = Array.isArray(instructions.configured)
          ? instructions
          : {
              configured: Object.entries(instructions)
                .filter(([slot, content]) => slot !== "import-mode" && typeof content === "string" && content.length > 0)
                .map(([slot]) => slot),
              ...(typeof instructions["import-mode"] === "string" ? { importMode: instructions["import-mode"] } : {}),
            };
        findings.push({ path: childPath, reason: "schema-secret" });
        continue;
      }
      const sensitive = schemaSensitive || envDeclarationSensitive && key === "default" || SENSITIVE_KEY.test(key);
      if (sensitive && child !== null && child !== undefined) {
        result[key] = "[REDACTED]";
        findings.push({
          path: childPath,
          reason: envDeclarationSensitive && key === "default" ? "schema-secret" : "sensitive-key",
        });
      } else {
        result[key] = redactValue(child, childPath, findings, sensitive);
      }
    }
    return result;
  }
  if (typeof value === "string") {
    if (CREDENTIAL_VALUE.test(value)) {
      findings.push({ path, reason: "credential-pattern" });
      return "[REDACTED]";
    }
    if (looksHighEntropy(value, path)) {
      findings.push({ path, reason: "high-entropy" });
      return "[REDACTED]";
    }
  }
  return value;
}

export function redactInventoryConfig(config: unknown): {
  redacted: unknown;
  findings: RedactionFinding[];
} {
  const findings: RedactionFinding[] = [];
  return { redacted: redactValue(config, "", findings), findings };
}

export interface BuildInventorySnapshotInput {
  installationId: string;
  organizationId: string;
  capturedAt: string;
  targets: SurfaceId[];
  effectiveConfig: HarnessConfig;
  resources: HarnessResource[];
  drift: InventorySnapshot["drift"];
}

export function buildInventorySnapshot(input: BuildInventorySnapshotInput): InventorySnapshot {
  // Artifact bodies are deliberately not part of inventory. Config references,
  // versions, assignments and remaining parsed settings are sufficient.
  const assignments = input.resources.map((resource) => ({
    identity: resource.identity,
    scope: resource.scope,
    ...(resource.revision ? { revision: resource.revision } : {}),
  }));
  const sanitized = sanitizeCapturedSecrets(input.effectiveConfig);
  const { redacted, findings } = redactInventoryConfig({
    effectiveConfig: inventoryProjection(sanitized.config),
    assignments,
  });
  const safe = redacted as Pick<InventorySnapshot, "effectiveConfig" | "assignments">;
  return {
    version: 1,
    installationId: input.installationId,
    organizationId: input.organizationId,
    capturedAt: input.capturedAt,
    targets: [...input.targets],
    effectiveConfig: safe.effectiveConfig,
    assignments: safe.assignments,
    drift: input.drift,
    redactions: [
      ...sanitized.findings.map((finding) => ({
        path: `effectiveConfig.${finding.path}`,
        reason: "credential-pattern" as const,
      })),
      ...findings,
    ],
  };
}
