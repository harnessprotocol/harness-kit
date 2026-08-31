import { describe, expect, it } from "vitest";
import {
  HARNESS_RESOURCE_KINDS,
  PORTABLE_RESOURCE_KINDS,
  SURFACE_IDS,
  COMPILE_SURFACE_IDS,
  TARGET_CAPABILITY_MATRIX,
  getTargetCapability,
} from "../src/index.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TargetResourceCapability } from "../src/index.js";

const legacyMatrix = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "fixtures", "legacy-capability-matrix.json"), "utf-8"),
) as TargetResourceCapability[];

const OPERATIONS = ["capture", "apply", "reconcile", "rollback"] as const;
const SCOPES = ["organization", "personal", "project", "session"] as const;

describe("capability matrix re-keyed to surfaces (Task 11)", () => {
  it("exposes the resource-kind vocabulary as a runtime const matching the portable set", () => {
    expect(PORTABLE_RESOURCE_KINDS).toEqual(HARNESS_RESOURCE_KINDS);
    expect(HARNESS_RESOURCE_KINDS).toHaveLength(10);
  });

  it("defines every cell for all 11 surfaces x every resource kind", () => {
    expect(TARGET_CAPABILITY_MATRIX).toHaveLength(SURFACE_IDS.length * HARNESS_RESOURCE_KINDS.length);
    for (const surface of SURFACE_IDS) {
      for (const kind of HARNESS_RESOURCE_KINDS) {
        const cell = getTargetCapability(surface, kind);
        for (const operation of OPERATIONS) {
          expect(cell.operations[operation], `${surface}/${kind}/${operation}`).toBeDefined();
        }
        for (const scope of SCOPES) {
          expect(cell.scopes[scope], `${surface}/${kind}/${scope}`).toBeDefined();
        }
      }
    }
  });

  it("keeps the legacy 8 compile-surface cells byte-identical to the pre-re-key matrix", () => {
    // fixtures/legacy-capability-matrix.json is a dump of TARGET_CAPABILITY_MATRIX
    // taken immediately before the re-key (8 targets x 10 kinds = 80 cells).
    expect(legacyMatrix).toHaveLength(80);
    for (const legacyCell of legacyMatrix) {
      const cell = getTargetCapability(
        legacyCell.target as (typeof SURFACE_IDS)[number],
        legacyCell.resource as (typeof HARNESS_RESOURCE_KINDS)[number],
      );
      expect(cell, `${legacyCell.target}/${legacyCell.resource}`).toEqual(legacyCell);
    }
    // ...and the fixture covers exactly the compile-surface set.
    expect(new Set(legacyMatrix.map((cell) => cell.target))).toEqual(new Set(COMPILE_SURFACE_IDS));
  });

  it("marks kinds the harness has no concept of as not-applicable everywhere", () => {
    for (const [surface, kind] of [
      ["pi", "mcp-server"],
      ["pi", "plugin"],
      ["claude-desktop", "plugin"],
      ["claude-desktop", "permissions"],
    ] as const) {
      const cell = getTargetCapability(surface, kind);
      for (const operation of OPERATIONS) {
        expect(cell.operations[operation], `${surface}/${kind}/${operation}`).toBe("not-applicable");
      }
      for (const scope of SCOPES) {
        expect(cell.scopes[scope], `${surface}/${kind}/${scope}`).toBe("not-applicable");
      }
    }
  });

  it("derives capture-native / apply-source-only cells for the new surfaces' store-backed kinds", () => {
    const desktopMcp = getTargetCapability("claude-desktop", "mcp-server");
    expect(desktopMcp.operations.capture).toBe("native");
    expect(desktopMcp.operations.apply).toBe("source-only");
    expect(desktopMcp.note).toMatch(/M2/);

    const copilotSkill = getTargetCapability("copilot-cli", "skill");
    expect(copilotSkill.operations.capture).toBe("native");
    expect(copilotSkill.operations.apply).toBe("source-only");

    const piPermissions = getTargetCapability("pi", "permissions");
    expect(piPermissions.operations.capture).toBe("native");
    expect(piPermissions.operations.apply).toBe("source-only");
  });

  it("marks store-less (but applicable) kinds on the new surfaces unsupported with the unmanaged-locally note", () => {
    const desktopSkills = getTargetCapability("claude-desktop", "skill");
    expect(desktopSkills.operations.capture).toBe("unsupported");
    expect(desktopSkills.operations.apply).toBe("unsupported");
    expect(desktopSkills.note).toMatch(/unmanaged locally/);

    const copilotEnv = getTargetCapability("copilot-cli", "env");
    expect(copilotEnv.operations.apply).toBe("unsupported");
  });

  it("throws for a genuinely unknown surface id", () => {
    expect(() =>
      getTargetCapability("mystery-harness" as (typeof SURFACE_IDS)[number], "skill"),
    ).toThrow(/mystery-harness/);
  });
});
