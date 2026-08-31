import { describe, expect, it } from "vitest";
import { SURFACES, getSurface } from "../src/surfaces/registry.js";
import {
  BUNDLE_FORMAT_VERSION,
  BundleError,
  toBundle,
  fromBundle,
} from "../src/definitions/bundle.js";

const SAMPLE_MATRIX = {
  "claude-code": { "mcp-server": { install: "full" } },
  pi: { "mcp-server": "not-applicable" },
};

function validBundleValue(): unknown {
  return JSON.parse(
    JSON.stringify(
      toBundle({ surfaces: SURFACES, capabilityMatrix: SAMPLE_MATRIX, bundleNumber: 1 }),
    ),
  );
}

describe("definitions bundle format", () => {
  it("round-trips through JSON.stringify/parse without loss", () => {
    const bundle = toBundle({
      surfaces: SURFACES,
      capabilityMatrix: SAMPLE_MATRIX,
      bundleNumber: 1,
    });
    const revived = fromBundle(JSON.parse(JSON.stringify(bundle)));
    expect(revived).toEqual(bundle);
    expect(revived.surfaces).toEqual(SURFACES);
    expect(revived.capabilityMatrix).toEqual(SAMPLE_MATRIX);
  });

  it("carries formatVersion 1, the bundle number, and a valid ISO-8601 generatedAt", () => {
    const bundle = toBundle({
      surfaces: SURFACES,
      capabilityMatrix: SAMPLE_MATRIX,
      bundleNumber: 1,
    });
    expect(bundle.formatVersion).toBe(1);
    expect(BUNDLE_FORMAT_VERSION).toBe(1);
    expect(bundle.bundleNumber).toBe(1);
    expect(typeof bundle.generatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(bundle.generatedAt))).toBe(false);
  });

  it("honors a caller-supplied generatedAt", () => {
    const bundle = toBundle({
      surfaces: SURFACES,
      capabilityMatrix: SAMPLE_MATRIX,
      bundleNumber: 4,
      generatedAt: "2026-08-31T00:00:00.000Z",
    });
    expect(bundle.generatedAt).toBe("2026-08-31T00:00:00.000Z");
    expect(bundle.bundleNumber).toBe(4);
  });

  it("rejects a newer formatVersion, naming both the found and supported versions", () => {
    const value = validBundleValue() as Record<string, unknown>;
    value.formatVersion = 2;
    expect(() => fromBundle(value)).toThrow(/\b2\b/);
    expect(() => fromBundle(value)).toThrow(/\b1\b/);
    expect(() => fromBundle(value)).toThrow(/formatVersion/);
  });

  it("rejects values that are not objects", () => {
    expect(() => fromBundle(null)).toThrow(/object/);
    expect(() => fromBundle("bundle")).toThrow(/object/);
    expect(() => fromBundle(42)).toThrow(/object/);
    expect(() => fromBundle([])).toThrow(/object/);
  });

  it("rejects a bundle missing surfaces, or with non-array surfaces", () => {
    const missing = validBundleValue() as Record<string, unknown>;
    delete missing.surfaces;
    expect(() => fromBundle(missing)).toThrow(/surfaces/);

    const notArray = validBundleValue() as Record<string, unknown>;
    notArray.surfaces = { "claude-code": {} };
    expect(() => fromBundle(notArray)).toThrow(/surfaces/);
    expect(() => fromBundle(notArray)).toThrow(/array/);
  });

  it("rejects a surface entry missing id or stores", () => {
    const noId = validBundleValue() as { surfaces: Record<string, unknown>[] };
    delete noId.surfaces[0].id;
    expect(() => fromBundle(noId)).toThrow(/id/);

    const noStores = validBundleValue() as { surfaces: Record<string, unknown>[] };
    delete noStores.surfaces[2].stores;
    expect(() => fromBundle(noStores)).toThrow(/stores/);
  });

  it("rejects malformed store entries", () => {
    const badScope = validBundleValue() as {
      surfaces: { stores: Record<string, unknown>[] }[];
    };
    badScope.surfaces[0].stores[0].scope = "global";
    expect(() => fromBundle(badScope)).toThrow(/scope/);

    const badPath = validBundleValue() as {
      surfaces: { stores: Record<string, unknown>[] }[];
    };
    badPath.surfaces[0].stores[0].path = 7;
    expect(() => fromBundle(badPath)).toThrow(/path/);
  });

  it("rejects a bundleNumber that is not a non-negative integer", () => {
    for (const bad of [-1, 1.5, "1", null, undefined]) {
      const value = validBundleValue() as Record<string, unknown>;
      if (bad === undefined) {
        delete value.bundleNumber;
      } else {
        value.bundleNumber = bad;
      }
      expect(() => fromBundle(value), `bundleNumber=${String(bad)}`).toThrow(
        /bundleNumber/,
      );
    }
  });

  it("accepts a bundle carrying only a subset of the known surfaces", () => {
    const subset = [getSurface("claude-code"), getSurface("pi")];
    const value = JSON.parse(
      JSON.stringify(
        toBundle({ surfaces: subset, capabilityMatrix: null, bundleNumber: 7 }),
      ),
    );
    const revived = fromBundle(value);
    expect(revived.surfaces.map((s) => s.id)).toEqual(["claude-code", "pi"]);
  });

  it("rejects a surface entry whose id is not a known SurfaceId, naming it", () => {
    const value = validBundleValue() as { surfaces: Record<string, unknown>[] };
    value.surfaces[1].id = "mystery-harness";
    expect(() => fromBundle(value)).toThrow(/mystery-harness/);
  });

  it("rejects a bundle missing the capabilityMatrix key", () => {
    const value = validBundleValue() as Record<string, unknown>;
    delete value.capabilityMatrix;
    expect(() => fromBundle(value)).toThrow(/capabilityMatrix/);
  });

  it("rejects a generatedAt that does not parse as a date", () => {
    const value = validBundleValue() as Record<string, unknown>;
    value.generatedAt = "yesterday-ish";
    expect(() => fromBundle(value)).toThrow(/generatedAt/);
  });

  it("rejects a non-boolean priority", () => {
    const value = validBundleValue() as { surfaces: Record<string, unknown>[] };
    value.surfaces[0].priority = "yes";
    expect(() => fromBundle(value)).toThrow(/priority/);
  });

  it("rejects a family outside the ProductFamily union, naming it", () => {
    const value = validBundleValue() as { surfaces: Record<string, unknown>[] };
    value.surfaces[0].family = "acme";
    expect(() => fromBundle(value)).toThrow(/acme/);
    expect(() => fromBundle(value)).toThrow(/family/);
  });

  it("rejects non-array detect and notApplicable", () => {
    const badDetect = validBundleValue() as { surfaces: Record<string, unknown>[] };
    badDetect.surfaces[0].detect = {};
    expect(() => fromBundle(badDetect)).toThrow(/detect/);

    const badNotApplicable = validBundleValue() as { surfaces: Record<string, unknown>[] };
    badNotApplicable.surfaces[0].notApplicable = "plugin";
    expect(() => fromBundle(badNotApplicable)).toThrow(/notApplicable/);
  });

  it("rejects a malformed detect probe", () => {
    const badScope = validBundleValue() as {
      surfaces: { detect: Record<string, unknown>[] }[];
    };
    badScope.surfaces[0].detect[0].scope = "machine";
    expect(() => fromBundle(badScope)).toThrow(/detect\[0\]\.scope/);

    const badPath = validBundleValue() as {
      surfaces: { detect: Record<string, unknown>[] }[];
    };
    badPath.surfaces[0].detect[0].path = 3;
    expect(() => fromBundle(badPath)).toThrow(/detect\[0\]\.path/);
  });

  it("tags errors with a stable code", () => {
    const versioned = validBundleValue() as Record<string, unknown>;
    versioned.formatVersion = 2;
    expect(catchBundleError(() => fromBundle(versioned)).code).toBe("unsupported-version");
    expect(catchBundleError(() => fromBundle(null)).code).toBe("malformed");

    const badNumber = validBundleValue() as Record<string, unknown>;
    badNumber.bundleNumber = -3;
    expect(catchBundleError(() => fromBundle(badNumber)).code).toBe("malformed");
  });

  it("toBundle rejects a bundleNumber that is not a non-negative integer", () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(
        () => toBundle({ surfaces: SURFACES, capabilityMatrix: null, bundleNumber: bad }),
        `bundleNumber=${String(bad)}`,
      ).toThrow(/bundleNumber/);
    }
  });
});

function catchBundleError(fn: () => unknown): BundleError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(BundleError);
    return err as BundleError;
  }
  throw new Error("expected a BundleError to be thrown");
}
