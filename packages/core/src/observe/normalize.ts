import type { HarnessResourceKind } from "../portability/types.js";
import type { StoreFormatId, SurfaceId, SurfaceScope } from "../surfaces/types.js";
import { digestValue } from "../portability/resource-model.js";
import { looksLikeSecret } from "../portability/secrets.js";
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
  /** `${kind}:${name.toLowerCase().trim()}` — cross-surface identity. */
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
 * with different line endings digests identically.
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

/** Sort a string map's keys and placeholder secret-looking values. */
function canonicalStringMap(map: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(map).sort()) {
    const value = map[key];
    if (value === undefined) continue;
    result[key] =
      typeof value === "string" && looksLikeSecret(key, value) ? SECRET_PLACEHOLDER : value;
  }
  return result;
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
 * - `args` kept IN ORDER — argument order is semantic for commands.
 * - `env`/`headers` keys sorted; values that look like secrets become the
 *   fixed placeholder (rotation is not a diff), everything else kept
 *   verbatim (a PORT=5432 change IS a real diff).
 * - provenance-only fields (source, version, integrity) and anything else
 *   unrecognized are dropped; `enabled: false` is KEPT (semantic), and
 *   `bearerTokenEnvVar` is kept — it names a variable, not a secret value.
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
  if (Array.isArray(value.args)) result.args = [...value.args];
  if (isRecord(value.env)) result.env = canonicalStringMap(value.env);
  if (typeof value.url === "string") result.url = value.url;
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
