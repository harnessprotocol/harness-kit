import type { EnvDeclaration, HarnessConfig } from "../types.js";

export interface SecretSanitizationFinding {
  path: string;
  variable: string;
}

export interface SecretSanitizationResult {
  config: HarnessConfig;
  findings: SecretSanitizationFinding[];
}

// Substring patterns for compound names (api_key, apiKey, client-secret, …)
// plus token-boundary patterns for short bare words (key, pat, auth,
// credential) that would over-match as substrings (KEYSPACE, path, author).
// The token boundary is "start/end or a non-alphanumeric" — `\b` treats `_`
// as a word character, so it would miss MY_KEY.
const SENSITIVE_KEY = /(?:authorization|token|api[-_]?key|access[-_]?key|client[-_]?secret|password|passwd|private[-_]?key|secret|(?:^|[^a-z0-9])(?:key|pat|auth|credentials?)(?:[^a-z0-9]|$))/i;
const REFERENCE = /^(?:\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}|env:[A-Za-z_][A-Za-z0-9_]*|secret:\/\/[^\s]+)$/;
const CREDENTIAL_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|:\/\/[^\s/:]+:[^\s/@]+@|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,})/;
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

/**
 * Sanitize a command's argument list against the same patterns
 * sanitizeCapturedSecrets applies to arrays, but with a caller-chosen
 * placeholder instead of env-var references (observe/normalize.ts uses the
 * fixed "<secret>" placeholder so secret rotations never change a digest):
 * - inline sensitive flags (`--api-key=VALUE`) keep the flag name, replace
 *   the value — a flag RENAME still diffs;
 * - a bare sensitive flag (`--token`) placeholders the NEXT element;
 * - an element matching a credential value shape is placeholdered.
 * Order is preserved; values that are already REFERENCEs stay verbatim.
 * Additive helper — sanitizeCapturedSecrets behavior is unchanged.
 */
export function sanitizeCommandArgs(args: string[], placeholder: string): string[] {
  return args.map((arg, index) => {
    const inline = arg.match(INLINE_SENSITIVE_FLAG);
    if (inline && !REFERENCE.test(inline[2])) return `${inline[1]}${placeholder}`;
    const followsSensitiveFlag = index > 0 && SENSITIVE_FLAG.test(args[index - 1]);
    if ((followsSensitiveFlag || CREDENTIAL_VALUE.test(arg)) && arg.length > 0 && !REFERENCE.test(arg)) {
      return placeholder;
    }
    return arg;
  });
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

// ── URL sanitization ────────────────────────────────────────────

const SENSITIVE_QUERY_TOKENS = new Set([
  "key",
  "apikey",
  "token",
  "accesstoken",
  "secret",
  "signature",
  "sig",
  "password",
  "auth",
  "bearer",
]);

export function isSensitiveQueryParam(name: string): boolean {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => SENSITIVE_QUERY_TOKENS.has(token));
}

/**
 * Sanitize a URL's embedded secrets while keeping everything semantic:
 * - userinfo (`scheme://user[:pass]@host`) → `scheme://<secret>@host`;
 * - query values whose param NAME is sensitive, or whose value matches the
 *   credential-shape heuristics, → `<secret>`.
 * Param names stay verbatim (a param rename must still diff), and host +
 * path stay verbatim — deliberately narrower than running looksLikeSecret
 * over the whole URL, which would hide host/path changes.
 */
export function sanitizeUrl(url: string, placeholder: string): string {
  // Userinfo: `?`/`#` excluded (userinfo cannot legally contain them, so a
  // `@` inside a query/fragment never matches); `@` allowed inside with
  // greedy matching so an invalid unencoded `@` in the password fails safe
  // (whole userinfo placeholdered, nothing leaks past the last `@` before
  // host).
  const withUserinfo = url.replace(/(:\/\/)[^/\s?#]*@/, `$1${placeholder}@`);
  const queryIndex = withUserinfo.indexOf("?");
  if (queryIndex === -1) return withUserinfo;
  const base = withUserinfo.slice(0, queryIndex);
  const query = withUserinfo
    .slice(queryIndex + 1)
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (value.length === 0) return pair;
      if (isSensitiveQueryParam(name) || looksLikeSecret(name, value)) {
        return `${name}=${placeholder}`;
      }
      return pair;
    })
    .join("&");
  return `${base}?${query}`;
}
