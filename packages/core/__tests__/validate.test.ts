import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseHarness } from "../src/parser/parse-harness.js";
import { validateHarness, validateSkillName } from "../src/schema/validate.js";

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

  it("reports invalid skill name in plugins", () => {
    const result = validateHarness({
      version: "1",
      metadata: { name: "test", description: "test" },
      plugins: [{ name: "My_BadSkill!", source: "owner/repo" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Invalid skill name"))).toBe(true);
  });
});

// ── validateSkillName ─────────────────────────────────────────

describe("validateSkillName", () => {
  it("accepts valid kebab-case names", () => {
    expect(validateSkillName("my-skill")).toBe(true);
    expect(validateSkillName("research")).toBe(true);
    expect(validateSkillName("code-review-pro")).toBe(true);
    expect(validateSkillName("a1b2c3")).toBe(true);
  });

  it("rejects names with uppercase", () => {
    expect(validateSkillName("MySkill")).toBe(false);
    expect(validateSkillName("MY-SKILL")).toBe(false);
  });

  it("rejects names with underscores", () => {
    expect(validateSkillName("my_skill")).toBe(false);
  });

  it("rejects names with special characters", () => {
    expect(validateSkillName("my skill")).toBe(false);
    expect(validateSkillName("my.skill")).toBe(false);
    expect(validateSkillName("my!skill")).toBe(false);
  });

  it("rejects names with leading or trailing hyphens", () => {
    expect(validateSkillName("-my-skill")).toBe(false);
    expect(validateSkillName("my-skill-")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateSkillName("")).toBe(false);
  });

  it("rejects names over 64 characters", () => {
    expect(validateSkillName("a".repeat(65))).toBe(false);
    expect(validateSkillName("a".repeat(64))).toBe(true);
  });
});
