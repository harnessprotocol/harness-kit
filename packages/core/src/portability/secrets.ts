import type { EnvDeclaration, HarnessConfig } from "../types.js";

export interface SecretSanitizationFinding {
  path: string;
  variable: string;
}

export interface SecretSanitizationResult {
  config: HarnessConfig;
  findings: SecretSanitizationFinding[];
}

const SENSITIVE_KEY = /(?:authorization|auth[_-]?token|api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|secret)$/i;
const REFERENCE = /^(?:\$[A-Z_][A-Z0-9_]*|\$\{[A-Z_][A-Z0-9_]*\}|env:[A-Z_][A-Z0-9_]*|secret:\/\/[^\s]+)$/;

function variableName(path: string[]): string {
  const normalized = path
    .join("_")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return `HARNESS_${normalized || "SECRET"}`.slice(0, 120);
}

function isSecretPath(path: string[]): boolean {
  const key = path.at(-1) ?? "";
  return SENSITIVE_KEY.test(key) || path.some((segment) => segment.toLowerCase() === "headers");
}

function sanitizeValue(
  value: unknown,
  path: string[],
  findings: SecretSanitizationFinding[],
): unknown {
  if (typeof value === "string" && isSecretPath(path) && value.length > 0 && !REFERENCE.test(value)) {
    const variable = variableName(path);
    findings.push({ path: path.join("."), variable });
    return `\${${variable}}`;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, [...path, String(index)], findings));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        sanitizeValue(child, [...path, key], findings),
      ]),
    );
  }
  return value;
}

/** Replace captured credential values with local variable declarations. */
export function sanitizeCapturedSecrets(config: HarnessConfig): SecretSanitizationResult {
  const findings: SecretSanitizationFinding[] = [];
  const sanitized = sanitizeValue(config, [], findings) as HarnessConfig;
  const declarations = new Map<string, EnvDeclaration>(
    (sanitized.env ?? []).map((entry) => [entry.name, entry]),
  );
  for (const finding of findings) {
    if (!declarations.has(finding.variable)) {
      declarations.set(finding.variable, {
        name: finding.variable,
        description: `Local credential for captured field ${finding.path}.`,
        required: true,
        sensitive: true,
      });
    }
  }
  if (declarations.size > 0) sanitized.env = [...declarations.values()];
  return { config: sanitized, findings };
}
