import { SURFACE_IDS } from "../surfaces/types.js";
import type { SurfaceDescriptor } from "../surfaces/types.js";

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
 * desktop webview's CSP forbids eval'd validators.
 */

export const BUNDLE_FORMAT_VERSION = 1 as const;

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
  return {
    formatVersion: BUNDLE_FORMAT_VERSION,
    bundleNumber: input.bundleNumber,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    surfaces: input.surfaces,
    capabilityMatrix: input.capabilityMatrix,
  };
}

function fail(message: string): never {
  throw new Error(`Invalid definitions bundle: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    fail(`${path} must be a string (got ${describe(value)})`);
  }
  return value;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "object" ? "an object" : `${typeof value} ${JSON.stringify(value)}`;
}

function validateStore(value: unknown, path: string): void {
  if (!isRecord(value)) {
    fail(`${path} must be an object (got ${describe(value)})`);
  }
  requireString(value.kind, `${path}.kind`);
  if (value.scope !== "user" && value.scope !== "project") {
    fail(`${path}.scope must be "user" or "project" (got ${describe(value.scope)})`);
  }
  requireString(value.formatId, `${path}.formatId`);
  requireString(value.path, `${path}.path`);
}

function validateSurface(value: unknown, path: string): void {
  if (!isRecord(value)) {
    fail(`${path} must be an object (got ${describe(value)})`);
  }
  const id = requireString(value.id, `${path}.id`);
  if (!(SURFACE_IDS as readonly string[]).includes(id)) {
    fail(
      `${path}.id "${id}" is not a known surface id. Known ids: ${SURFACE_IDS.join(", ")}. ` +
        `(Surfaces beyond this build's compiled set are not supported until M4.)`,
    );
  }
  requireString(value.label, `${path}.label`);
  requireString(value.family, `${path}.family`);
  if (typeof value.priority !== "boolean") {
    fail(`${path}.priority must be a boolean (got ${describe(value.priority)})`);
  }
  if (!Array.isArray(value.detect)) {
    fail(`${path}.detect must be an array (got ${describe(value.detect)})`);
  }
  if (!Array.isArray(value.stores)) {
    fail(`${path}.stores must be an array (got ${describe(value.stores)})`);
  }
  value.stores.forEach((store, i) => validateStore(store, `${path}.stores[${i}]`));
  if (!Array.isArray(value.notApplicable)) {
    fail(`${path}.notApplicable must be an array (got ${describe(value.notApplicable)})`);
  }
}

/**
 * Validate a parsed JSON value as a v1 definitions bundle.
 *
 * Structural checks only — no signature verification and no bundleNumber
 * monotonicity (both M4). Throws an Error with an actionable message on the
 * first problem found.
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
    );
  }
  const { bundleNumber } = value;
  if (typeof bundleNumber !== "number" || !Number.isInteger(bundleNumber) || bundleNumber < 0) {
    fail(`bundleNumber must be a non-negative integer (got ${describe(bundleNumber)})`);
  }
  requireString(value.generatedAt, "generatedAt");
  if (!("capabilityMatrix" in value)) {
    fail(`missing capabilityMatrix (carried opaquely, but the key must be present)`);
  }
  if (!Array.isArray(value.surfaces)) {
    fail(`surfaces must be an array (got ${describe(value.surfaces)})`);
  }
  value.surfaces.forEach((surface, i) => validateSurface(surface, `surfaces[${i}]`));

  return {
    formatVersion: BUNDLE_FORMAT_VERSION,
    bundleNumber,
    generatedAt: value.generatedAt as string,
    surfaces: value.surfaces as unknown as SurfaceDescriptor[],
    capabilityMatrix: value.capabilityMatrix,
  };
}
