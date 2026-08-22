import { describe, it, expect } from "vitest";
import { validateHarnessYaml, parseHarness } from "../src/index.js";
import schema from "../src/schema/harness.schema.json" with { type: "json" };

const BASE = `version: "1"
kind: profile
metadata:
  name: conformance
  description: Exercises every top-level section the v1 schema defines.
`;

// The vendored schema is a copy of https://harnessprotocol.ai/schema/v1/harness.schema.json,
// refreshed with `pnpm --filter @harness-kit/core fetch-schema`. It went three sections
// stale (skills, architectural-constraints, policy) because nothing compared it to
// upstream, so harness.yaml files that are valid per the published spec were rejected
// outright. These pin every section the schema declares.
describe("v1 schema conformance", () => {
  const declared = Object.keys(
    (schema as { properties: Record<string, unknown> }).properties,
  ).filter((k) => k !== "$schema");

  it("declares every section this test file covers", () => {
    expect(declared.sort()).toEqual(
      [
        "architectural-constraints",
        "env",
        "extends",
        "instructions",
        "kind",
        "mcp-servers",
        "metadata",
        "permissions",
        "plugins",
        "policy",
        "skills",
        "version",
      ].sort(),
    );
  });

  it("accepts a top-level skills list (HEP-4)", () => {
    const r = validateHarnessYaml(
      BASE + `skills:\n  - name: my-skill\n    source: ./skills/my-skill\n    loading: deferred\n`,
    );
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("accepts architectural-constraints at all three enforcement levels (HEP-3)", () => {
    const r = validateHarnessYaml(
      BASE +
        `architectural-constraints:\n` +
        `  linters:\n` +
        `    - name: module-boundary\n      description: No cross-layer imports.\n      enforcement: block\n` +
        `  structural-tests:\n` +
        `    - name: layering\n      description: Layers stay acyclic.\n      entrypoint: pnpm test:arch\n` +
        `  review-policy:\n` +
        `    enabled: true\n` +
        `    patterns:\n` +
        `      - name: no-queries-in-loops\n        rule: Never issue a DB query inside a loop.\n        severity: error\n`,
    );
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("accepts a governance policy section", () => {
    const r = validateHarnessYaml(
      BASE +
        `policy:\n  require-integrity: true\n  plugins:\n    allowed-sources:\n      - harnessprotocol/harness-kit\n`,
    );
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  // The sections validate but nothing in compile/ consumes them yet. Round-tripping
  // is what keeps them recoverable once something does, so pin it.
  it("preserves architectural-constraints through parse", () => {
    const parsed = parseHarness(
      BASE +
        `architectural-constraints:\n  review-policy:\n    enabled: true\n    patterns:\n      - name: p\n        rule: r\n`,
    ) as { config?: Record<string, unknown> } & Record<string, unknown>;
    const config = (parsed.config ?? parsed) as Record<string, unknown>;
    expect(config["architectural-constraints"]).toEqual({
      "review-policy": { enabled: true, patterns: [{ name: "p", rule: "r" }] },
    });
  });

  it("still rejects a genuinely unknown top-level section", () => {
    const r = validateHarnessYaml(BASE + `not-a-real-section:\n  x: 1\n`);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes("additional properties"))).toBe(true);
  });
});
