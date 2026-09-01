import type { HarnessResourceKind } from "../portability/types.js";
import type { StoreFormatId, SurfaceId, SurfaceScope } from "../surfaces/types.js";
import { digestValue } from "../portability/resource-model.js";
import { looksLikeSecret, sanitizeCommandArgs } from "../portability/secrets.js";
import { isRecord } from "../utils/is-record.js";
import type { ObservedResource, SurfaceObservation } from "./observe-surface.js";
import type { InstructionsStoreValue, SkillStoreValue } from "./read-store.js";

/**
 * Cross-surface resource normalization, identity, and digests (design.md §3,
 * Task 9): turn raw ObservedResources into NormalizedResources whose
 * canonical form — and therefore digest — is the same for the same logical
 * resource regardless of which surface stored it and in what shape.
 *
 * Contracts:
 * - Pure functions, no IO of any kind.
 * - canonicalForm is JSON-serializable and secret-sanitized: values that
 *   look like credential material are replaced by the fixed placeholder
 *   "<secret>", so rotating a secret never changes a digest while renaming
 *   the key that holds it does.
 * - Determinism: digestValue()'s stableSerialize already deep-sorts object
 *   keys, so digests are key-order independent even without our sorting.
 *   The canonicalizers still sort keys explicitly so canonicalForm itself
 *   (not just its digest) is deterministic for callers that display or
 *   diff it; the digest layer is the load-bearing guarantee.
 */

/** Fixed placeholder for values that look like credential material. */
export const SECRET_PLACEHOLDER = "<secret>";

export interface NormalizedResource {
  surface: SurfaceId;
  kind: HarnessResourceKind;
  /** Original, case-preserved name as observed (display form; identityKey
   * holds the case-collapsed join key). */
  name: string;
  /**
   * `${kind}:${name.toLowerCase().trim()}` — cross-surface identity. The
   * case-collapsing means two case-differing names in the SAME file share
   * an identityKey; whether that is a collision or the same resource is a
   * Task 10 (gaps/diffs) decision, not made here.
   */
  identityKey: string;
  scope: SurfaceScope;
  /** Kind-specific, secret-sanitized, JSON-serializable canonical shape. */
  canonicalForm: unknown;
  /** digestValue(canonicalForm) — equal iff the logical content is equal. */
  digest: string;
  provenance: { file: string; formatId: StoreFormatId };
  needsConfirmation?: true;
}

// ── shared helpers ──────────────────────────────────────────────

/**
 * Normalize text content: CRLF → LF, trailing whitespace stripped per line,
 * trailing newlines trimmed. The same skill or instruction file checked out
 * with different line endings digests identically. Note: stripping per-line
 * trailing whitespace deliberately erases markdown hard-breaks (two trailing
 * spaces) — a hard-break-only difference is treated as not semantic here.
 */
function normalizeText(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * Deep-canonicalize an arbitrary JSON-ish value: object keys sorted, arrays
 * kept in order, `undefined` entries dropped (JSON round-trip stability),
 * and every string leaf passed through the secret-placeholder check against
 * the key it lives under.
 */
function deepCanonical(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    return looksLikeSecret(key, value) ? SECRET_PLACEHOLDER : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepCanonical(item, key));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const childKey of Object.keys(value).sort()) {
      const child = value[childKey];
      if (child === undefined) continue;
      result[childKey] = deepCanonical(child, childKey);
    }
    return result;
  }
  return value;
}

/**
 * Sort a string map's keys and placeholder secret-looking values. Non-string
 * values (nested objects/arrays smuggled into env/headers) are routed
 * through deepCanonical so secret strings inside them still get the
 * placeholder pass instead of passing through verbatim.
 */
function canonicalStringMap(map: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(map).sort()) {
    const value = map[key];
    if (value === undefined) continue;
    result[key] =
      typeof value === "string"
        ? looksLikeSecret(key, value)
          ? SECRET_PLACEHOLDER
          : value
        : deepCanonical(value, key);
  }
  return result;
}

/**
 * Sensitive query-parameter name tokens: a param name is sensitive when,
 * split on non-alphanumerics (`_`, `-`, `.` all act as separators), any
 * token is in this set. Token matching keeps `keyspace`, `region`,
 * `author` etc. non-sensitive while catching `api_key`, `access-token`,
 * `apiKey`, `X-Signature`, …
 */
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

function isSensitiveQueryParam(name: string): boolean {
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
function sanitizeUrl(url: string): string {
  // Userinfo: `?`/`#` excluded (userinfo cannot legally contain them, so a
  // `@` inside a query/fragment never matches); `@` allowed inside with
  // greedy matching so an invalid unencoded `@` in the password fails safe
  // (whole userinfo placeholdered, nothing leaks past the last `@` before
  // host).
  const withUserinfo = url.replace(/(:\/\/)[^/\s?#]*@/, `$1${SECRET_PLACEHOLDER}@`);
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
        return `${name}=${SECRET_PLACEHOLDER}`;
      }
      return pair;
    })
    .join("&");
  return `${base}?${query}`;
}

// ── kind-specific canonicalizers ────────────────────────────────

type Canonicalizer = (value: unknown) => unknown;

/**
 * mcp-server canonical form:
 * `{ transport, command?, args?, env?, url?, headers?, bearerTokenEnvVar?, enabled? }`
 * - transport made EXPLICIT: implicit-stdio shapes (claude's `{command,...}`
 *   with no transport/type key) canonicalize to `transport: "stdio"`, so the
 *   same server captured from `.claude.json` and `.cursor/mcp.json` digests
 *   identically.
 * - `args` kept IN ORDER — argument order is semantic for commands — with
 *   inline secrets sanitized per element (see sanitizeCommandArgs), and
 *   `url` has its userinfo and sensitive/credential-shaped query values
 *   placeholdered (see sanitizeUrl) — host, path, and param names stay
 *   verbatim.
 * - `env`/`headers` keys sorted; values that look like secrets become the
 *   fixed placeholder (rotation is not a diff), everything else kept
 *   verbatim (a PORT=5432 change IS a real diff).
 * - provenance-only fields (source, version, integrity) and anything else
 *   unrecognized are dropped; `enabled: false` is KEPT (semantic), and
 *   `bearerTokenEnvVar` is kept — it names a variable, not a secret value.
 *
 * The field whitelist here is paired with reverseTranslateServer
 * (import/read-mcp.ts) and the toml-codex/json-opencode codecs as the
 * upstream filters: everything those readers emit semantically is either
 * whitelisted here or provenance-only by design.
 */
function canonicalizeMcpServer(value: unknown): unknown {
  if (!isRecord(value)) return deepCanonical(value);

  const explicit = value.transport ?? value.type;
  const transport =
    typeof explicit === "string"
      ? explicit
      : typeof value.url === "string" && typeof value.command !== "string"
        ? "http"
        : "stdio";

  const result: Record<string, unknown> = { transport };
  if (typeof value.command === "string") result.command = value.command;
  if (Array.isArray(value.args)) {
    result.args = sanitizeCommandArgs(
      value.args.map((arg) => (typeof arg === "string" ? arg : String(arg))),
      SECRET_PLACEHOLDER,
    );
  }
  if (isRecord(value.env)) result.env = canonicalStringMap(value.env);
  if (typeof value.url === "string") result.url = sanitizeUrl(value.url);
  if (isRecord(value.headers)) result.headers = canonicalStringMap(value.headers);
  if (typeof value.bearerTokenEnvVar === "string") result.bearerTokenEnvVar = value.bearerTokenEnvVar;
  if (value.enabled === false) result.enabled = false;
  return result;
}

/**
 * skill canonical form: `{ name, content }` — name from frontmatter (already
 * resolved by the reader), content whitespace-normalized. Directory layout,
 * skillPath, and description (already inside the content's frontmatter) are
 * excluded, so the same skill in `.claude/skills` and `.agents/skills`
 * digests identically.
 */
function canonicalizeSkill(value: unknown): unknown {
  if (!isRecord(value)) return deepCanonical(value);
  const skill = value as Partial<SkillStoreValue>;
  return {
    name: typeof skill.name === "string" ? skill.name : "",
    content: typeof skill.content === "string" ? normalizeText(skill.content) : "",
  };
}

/**
 * instructions canonical form: `{ content }`, whitespace-normalized.
 * Identity stays the resource's reported (file-based) name — cross-surface
 * instruction identity is content-level and deferred to Task 10's diffing.
 */
function canonicalizeInstructions(value: unknown): unknown {
  if (!isRecord(value)) return deepCanonical(value);
  const instructions = value as Partial<InstructionsStoreValue>;
  return {
    content: typeof instructions.content === "string" ? normalizeText(instructions.content) : "",
  };
}

/** Default: deep key-sort + secret-placeholder pass over the raw value. */
function canonicalizeGeneric(value: unknown): unknown {
  return deepCanonical(value);
}

/**
 * Exhaustive canonicalizer table (repo idiom, cf. EXECUTORS in
 * read-store.ts): adding a HarnessResourceKind member without a
 * canonicalizer fails to compile.
 */
const CANONICALIZERS: Record<HarnessResourceKind, Canonicalizer> = {
  "mcp-server": canonicalizeMcpServer,
  skill: canonicalizeSkill,
  instructions: canonicalizeInstructions,
  permissions: canonicalizeGeneric,
  plugin: canonicalizeGeneric,
  env: canonicalizeGeneric,
  "architectural-constraints": canonicalizeGeneric,
  policy: canonicalizeGeneric,
  extends: canonicalizeGeneric,
  "native-extension": canonicalizeGeneric,
};

// ── public API ──────────────────────────────────────────────────

/** Normalize one observed resource into its canonical, digested form. */
export function normalizeResource(resource: ObservedResource): NormalizedResource {
  const canonicalForm = CANONICALIZERS[resource.kind](resource.value);
  return {
    surface: resource.surface,
    kind: resource.kind,
    name: resource.name,
    identityKey: `${resource.kind}:${resource.name.toLowerCase().trim()}`,
    scope: resource.scope,
    canonicalForm,
    digest: digestValue(canonicalForm),
    provenance: { ...resource.provenance },
    ...(resource.needsConfirmation ? { needsConfirmation: true as const } : {}),
  };
}

/** Normalize every resource of one surface observation, order preserved. */
export function normalizeObservation(obs: SurfaceObservation): NormalizedResource[] {
  return obs.resources.map(normalizeResource);
}
