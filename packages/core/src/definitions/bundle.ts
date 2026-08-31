import { PRODUCT_FAMILIES, SURFACE_IDS } from "../surfaces/types.js";
import type {
  ConfigStore,
  DetectProbe,
  PlatformPathOverrides,
  StoreFormatId,
  SurfaceDescriptor,
  SurfaceScope,
} from "../surfaces/types.js";
import type { HarnessResourceKind } from "../portability/types.js";

/**
 * Definitions bundle format v1 (design.md §7, D7 / ADR 0004).
 *
 * The bundle is the serialized form of the surface definitions and capability
 * matrix that CI compiles and publishes to `harnesskit.ai/definitions/v1/`.
 * This module is the FORMAT only — pure construction (`toBundle`) and
 * structural validation (`fromBundle`) of the JSON payload. In M1 the bundle
 * is loaded from disk or memory.
 *
 * Deliberately NOT here (all M4):
 * - remote fetch of the bundle;
 * - Ed25519 signature creation/verification (detached signatures, key
 *   rotation via cross-signed transition statements);
 * - monotonic `bundleNumber` anti-rollback enforcement — the field is carried
 *   from v1 so M4 can enforce it without a format bump.
 *
 * Open M4 design question: runtime-extensible surface ids. Today `fromBundle`
 * rejects any surface id outside the compiled `SURFACE_IDS` union, so a
 * remote bundle can update known surfaces but cannot introduce new ones
 * without an app release. Whether (and how) a bundle may carry surfaces
 * unknown to the binary is decided in M4.
 *
 * Validation is hand-rolled: core avoids runtime schema compilers because the
 * desktop webview's CSP forbids eval'd validators. Validators CONSTRUCT their
 * output field-by-field (tolerant reader: unknown keys are dropped), so a
 * future required field on the descriptor types is a compile error here.
 */

export const BUNDLE_FORMAT_VERSION = 1 as const;

/**
 * Error thrown by `toBundle`/`fromBundle`. The stable `code` lets M4's
 * fallback path distinguish "this binary is too old for the bundle"
 * (`unsupported-version` → fall back to the embedded snapshot, suggest an
 * update) from a corrupt/truncated payload (`malformed`).
 */
export class BundleError extends Error {
  readonly code: "unsupported-version" | "malformed";

  constructor(code: "unsupported-version" | "malformed", message: string) {
    super(message);
    this.name = "BundleError";
    this.code = code;
  }
}

export interface DefinitionsBundle {
  formatVersion: typeof BUNDLE_FORMAT_VERSION;
  /** Monotonic publish counter; anti-rollback enforcement arrives with signing (M4). */
  bundleNumber: number;
  /** ISO-8601 timestamp of bundle generation. */
  generatedAt: string;
  /** Surface descriptors carried by this bundle (may be a subset of SURFACE_IDS). */
  surfaces: SurfaceDescriptor[];
  /** Capability matrix payload; carried opaquely until the matrix re-key (Task 11) types it. */
  capabilityMatrix: unknown;
}

/** Build a v1 bundle object. `generatedAt` defaults to the current time. */
export function toBundle(input: {
  surfaces: SurfaceDescriptor[];
  capabilityMatrix: unknown;
  bundleNumber: number;
  generatedAt?: string;
}): DefinitionsBundle {
  if (!Number.isInteger(input.bundleNumber) || input.bundleNumber < 0) {
    fail(`bundleNumber must be a non-negative integer (got ${describe(input.bundleNumber)})`);
  }
  return {
    formatVersion: BUNDLE_FORMAT_VERSION,
    bundleNumber: input.bundleNumber,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    surfaces: input.surfaces,
    capabilityMatrix: input.capabilityMatrix,
  };
}

function fail(message: string, code: "unsupported-version" | "malformed" = "malformed"): never {
  throw new BundleError(code, `Invalid definitions bundle: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return (options as readonly string[]).includes(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    fail(`${path} must be a string (got ${describe(value)})`);
  }
  return value;
}

function requireScope(value: unknown, path: string): SurfaceScope {
  if (value !== "user" && value !== "project") {
    fail(`${path} must be "user" or "project" (got ${describe(value)})`);
  }
  return value;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  if (typeof value === "number") return `number ${String(value)}`;
  return `${typeof value} ${JSON.stringify(value)}`;
}

function validatePathOverrides(
  value: unknown,
  path: string,
): PlatformPathOverrides | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    fail(`${path} must be an object of per-OS path strings (got ${describe(value)})`);
  }
  const overrides: PlatformPathOverrides = {};
  for (const os of ["darwin", "win32", "linux"] as const) {
    if (value[os] !== undefined) {
      overrides[os] = requireString(value[os], `${path}.${os}`);
    }
  }
  return overrides;
}

function validateProbe(value: unknown, path: string): DetectProbe {
  if (!isRecord(value)) {
    fail(`${path} must be an object (got ${describe(value)})`);
  }
  const probe: DetectProbe = {
    scope: requireScope(value.scope, `${path}.scope`),
    path: requireString(value.path, `${path}.path`),
  };
  const pathByPlatform = validatePathOverrides(value.pathByPlatform, `${path}.pathByPlatform`);
  if (pathByPlatform !== undefined) probe.pathByPlatform = pathByPlatform;
  return probe;
}

function validateStore(value: unknown, path: string): ConfigStore {
  if (!isRecord(value)) {
    fail(`${path} must be an object (got ${describe(value)})`);
  }
  // `kind` and `formatId` are deliberately open-set (any string) per design §3:
  // a descriptor referencing a format this binary lacks renders the surface as
  // "needs app update" — degraded, never crashed. So an unknown value must
  // survive validation for downstream code to degrade on.
  // TODO(Task 11): tighten `kind` against a HARNESS_RESOURCE_KINDS const once
  // the capability-matrix re-key introduces one.
  const store: ConfigStore = {
    kind: requireString(value.kind, `${path}.kind`) as HarnessResourceKind,
    scope: requireScope(value.scope, `${path}.scope`),
    formatId: requireString(value.formatId, `${path}.formatId`) as StoreFormatId,
    path: requireString(value.path, `${path}.path`),
  };
  const pathByPlatform = validatePathOverrides(value.pathByPlatform, `${path}.pathByPlatform`);
  if (pathByPlatform !== undefined) store.pathByPlatform = pathByPlatform;
  if (value.shape !== undefined) {
    if (!isRecord(value.shape)) {
      fail(`${path}.shape must be an object (got ${describe(value.shape)})`);
    }
    const shape: NonNullable<ConfigStore["shape"]> = {};
    if (value.shape.rootKey !== undefined) {
      shape.rootKey = requireString(value.shape.rootKey, `${path}.shape.rootKey`);
    }
    if (value.shape.directory !== undefined) {
      if (value.shape.directory !== true) {
        fail(`${path}.shape.directory must be true when present (got ${describe(value.shape.directory)})`);
      }
      shape.directory = true;
    }
    store.shape = shape;
  }
  if (value.needsConfirmation !== undefined) {
    if (typeof value.needsConfirmation !== "boolean") {
      fail(`${path}.needsConfirmation must be a boolean (got ${describe(value.needsConfirmation)})`);
    }
    store.needsConfirmation = value.needsConfirmation;
  }
  return store;
}

function validateSurface(value: unknown, path: string): SurfaceDescriptor {
  if (!isRecord(value)) {
    fail(`${path} must be an object (got ${describe(value)})`);
  }
  const id = requireString(value.id, `${path}.id`);
  if (!isOneOf(id, SURFACE_IDS)) {
    fail(
      `${path}.id "${id}" is not a known surface id. Known ids: ${SURFACE_IDS.join(", ")}. ` +
        `(Surfaces beyond this build's compiled set are not supported until M4.)`,
    );
  }
  const family = requireString(value.family, `${path}.family`);
  if (!isOneOf(family, PRODUCT_FAMILIES)) {
    fail(
      `${path}.family "${family}" is not a known product family. ` +
        `Known families: ${PRODUCT_FAMILIES.join(", ")}`,
    );
  }
  if (typeof value.priority !== "boolean") {
    fail(`${path}.priority must be a boolean (got ${describe(value.priority)})`);
  }
  if (!Array.isArray(value.detect)) {
    fail(`${path}.detect must be an array (got ${describe(value.detect)})`);
  }
  if (!Array.isArray(value.stores)) {
    fail(`${path}.stores must be an array (got ${describe(value.stores)})`);
  }
  if (!Array.isArray(value.notApplicable)) {
    fail(`${path}.notApplicable must be an array (got ${describe(value.notApplicable)})`);
  }
  const surface: SurfaceDescriptor = {
    id,
    label: requireString(value.label, `${path}.label`),
    family,
    priority: value.priority,
    detect: value.detect.map((probe, i) => validateProbe(probe, `${path}.detect[${i}]`)),
    stores: value.stores.map((store, i) => validateStore(store, `${path}.stores[${i}]`)),
    // Open-set like store kinds — see the note in validateStore.
    notApplicable: value.notApplicable.map(
      (kind, i) => requireString(kind, `${path}.notApplicable[${i}]`) as HarnessResourceKind,
    ),
  };
  if (value.requiredBinary !== undefined) {
    surface.requiredBinary = requireString(value.requiredBinary, `${path}.requiredBinary`);
  }
  if (value.mergedClients !== undefined) {
    if (!Array.isArray(value.mergedClients)) {
      fail(`${path}.mergedClients must be an array (got ${describe(value.mergedClients)})`);
    }
    surface.mergedClients = value.mergedClients.map((client, i) =>
      requireString(client, `${path}.mergedClients[${i}]`),
    );
  }
  return surface;
}

/**
 * Validate a parsed JSON value as a v1 definitions bundle.
 *
 * Structural checks only — no signature verification and no bundleNumber
 * monotonicity (both M4). Throws a `BundleError` with an actionable message
 * on the first problem found; `code` is "unsupported-version" for a
 * formatVersion mismatch and "malformed" for everything else. Unknown keys
 * on any object are dropped (tolerant reader).
 */
export function fromBundle(value: unknown): DefinitionsBundle {
  if (!isRecord(value)) {
    fail(`expected an object (got ${describe(value)})`);
  }
  if (value.formatVersion !== BUNDLE_FORMAT_VERSION) {
    fail(
      `unsupported formatVersion ${JSON.stringify(value.formatVersion)}; ` +
        `this build supports formatVersion ${BUNDLE_FORMAT_VERSION}. ` +
        `Update harness-kit to read newer bundles.`,
      "unsupported-version",
    );
  }
  const { bundleNumber } = value;
  if (typeof bundleNumber !== "number" || !Number.isInteger(bundleNumber) || bundleNumber < 0) {
    fail(`bundleNumber must be a non-negative integer (got ${describe(bundleNumber)})`);
  }
  const generatedAt = requireString(value.generatedAt, "generatedAt");
  if (Number.isNaN(Date.parse(generatedAt))) {
    fail(`generatedAt must be an ISO-8601 timestamp (got ${JSON.stringify(generatedAt)})`);
  }
  if (!("capabilityMatrix" in value)) {
    fail(`missing capabilityMatrix (carried opaquely, but the key must be present)`);
  }
  if (!Array.isArray(value.surfaces)) {
    fail(`surfaces must be an array (got ${describe(value.surfaces)})`);
  }
  return {
    formatVersion: BUNDLE_FORMAT_VERSION,
    bundleNumber,
    generatedAt,
    surfaces: value.surfaces.map((surface, i) => validateSurface(surface, `surfaces[${i}]`)),
    capabilityMatrix: value.capabilityMatrix,
  };
}
