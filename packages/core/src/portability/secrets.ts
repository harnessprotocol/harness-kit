import type { EnvDeclaration, HarnessConfig } from "../types.js";

export interface SecretSanitizationFinding {
  path: string;
  variable: string;
}

export interface SecretSanitizationResult {
  config: HarnessConfig;
  findings: SecretSanitizationFinding[];
}

const SENSITIVE_KEY = /(?:authorization|token|api[-_]?key|access[-_]?key|client[-_]?secret|password|passwd|private[-_]?key|secret)/i;
const REFERENCE = /^(?:\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}|env:[A-Za-z_][A-Za-z0-9_]*|secret:\/\/[^\s]+)$/;
const CREDENTIAL_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|:\/\/[^\s/:]+:[^\s/@]+@)/;
const SENSITIVE_FLAG = /^--?(?:authorization|token|auth[-_]?token|api[-_]?key|access[-_]?token|access[-_]?key|client[-_]?secret|password|passwd|private[-_]?key|secret)$/i;
const INLINE_SENSITIVE_FLAG = /^(--?(?:authorization|token|auth[-_]?token|api[-_]?key|access[-_]?token|access[-_]?key|client[-_]?secret|password|passwd|private[-_]?key|secret)=)(.+)$/i;

/**
 * Value-level secret heuristic, shared with observe/normalize.ts: does this
 * key/value pair look like credential material? Reuses the same key-name and
 * value-shape patterns sanitizeCapturedSecrets applies during capture. A
 * value that is already an env/secret REFERENCE contains no secret material
 * and its identity is semantic, so it is never treated as a secret.
 */
export function looksLikeSecret(key: string, value: string): boolean {
  if (value.length === 0 || REFERENCE.test(value)) return false;
  return SENSITIVE_KEY.test(key) || CREDENTIAL_VALUE.test(value);
}

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
  forceSensitive = false,
): unknown {
  if (typeof value === "string") {
    const inline = value.match(INLINE_SENSITIVE_FLAG);
    if (inline && !REFERENCE.test(inline[2])) {
      const variable = variableName(path);
      findings.push({ path: path.join("."), variable });
      return `${inline[1]}\${${variable}}`;
    }
    if ((forceSensitive || isSecretPath(path) || CREDENTIAL_VALUE.test(value)) && value.length > 0 && !REFERENCE.test(value)) {
      const variable = variableName(path);
      findings.push({ path: path.join("."), variable });
      return `\${${variable}}`;
    }
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(
      item,
      [...path, String(index)],
      findings,
      index > 0 && typeof value[index - 1] === "string" && SENSITIVE_FLAG.test(value[index - 1]),
    ));
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const sensitiveEnvDeclaration =
      typeof object.name === "string" &&
      object.sensitive !== false &&
      Object.hasOwn(object, "default");
    if (sensitiveEnvDeclaration) {
      findings.push({ path: [...path, "default"].join("."), variable: object.name as string });
    }
    return Object.fromEntries(
      Object.entries(object)
        .filter(([key]) => !(sensitiveEnvDeclaration && key === "default"))
        .map(([key, child]) => [
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
