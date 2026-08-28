import type { HarnessConfig, TargetPlatform } from "../types.js";
import type {
  HarnessResource,
  InventorySnapshot,
  RedactionFinding,
} from "./types.js";

const SENSITIVE_KEY = /(^|[-_])(api[-_]?key|token|secret|password|credential|authorization|cookie|private[-_]?key|access[-_]?key)($|[-_])/i;
const CREDENTIAL_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|:\/\/[^\s/:]+:[^\s/@]+@)/;

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
  targets: TargetPlatform[];
  effectiveConfig: HarnessConfig;
  resources: HarnessResource[];
  drift: InventorySnapshot["drift"];
}

export function buildInventorySnapshot(input: BuildInventorySnapshotInput): InventorySnapshot {
  // Artifact bodies are deliberately not part of inventory. Config references,
  // versions, assignments and remaining parsed settings are sufficient.
  const { redacted, findings } = redactInventoryConfig(input.effectiveConfig);
  return {
    version: 1,
    installationId: input.installationId,
    organizationId: input.organizationId,
    capturedAt: input.capturedAt,
    targets: [...input.targets],
    effectiveConfig: redacted,
    assignments: input.resources.map((resource) => ({
      identity: resource.identity,
      scope: resource.scope,
      ...(resource.revision ? { revision: resource.revision } : {}),
    })),
    drift: input.drift,
    redactions: findings,
  };
}
