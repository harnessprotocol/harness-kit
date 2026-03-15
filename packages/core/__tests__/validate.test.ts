import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseHarness } from "../src/parser/parse-harness.js";
import { validateHarness } from "../src/schema/validate.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf-8");
}

describe("validateHarness", () => {
  it("passes for a valid harness.yaml", () => {
    const { config } = parseHarness(loadFixture("valid-harness.yaml"));
    const result = validateHarness(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails for an invalid harness.yaml (integer version)", () => {
    const { config } = parseHarness(loadFixture("invalid-harness.yaml"));
    const result = validateHarness(config);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.isLegacyFormat).toBe(true);
  });

  it("detects legacy format", () => {
    const { config, isLegacyFormat } = parseHarness(
      loadFixture("legacy-harness.yaml"),
    );
    expect(isLegacyFormat).toBe(true);
    const result = validateHarness(config);
    expect(result.isLegacyFormat).toBe(true);
  });

  it("fails when version is missing", () => {
    const result = validateHarness({ metadata: { name: "test", description: "test" } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("version") || e.path.includes("version"))).toBe(true);
  });

  it("fails when metadata is missing on a profile", () => {
    const result = validateHarness({ version: "1" });
    expect(result.valid).toBe(false);
  });

  it("passes for a fragment without metadata", () => {
    const result = validateHarness({ version: "1", kind: "fragment" });
    expect(result.valid).toBe(true);
  });

  it("reports invalid plugin source format", () => {
    const result = validateHarness({
      version: "1",
      metadata: { name: "test", description: "test" },
      plugins: [{ name: "foo", source: "not-valid" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.fix?.includes("owner/repo"))).toBe(true);
  });
});
