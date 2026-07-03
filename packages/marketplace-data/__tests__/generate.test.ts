import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot, generateMarketplaceData } from "../src/generate.js";
import { parseSkillMarkdown } from "../src/read-skills.js";
import { buildHarnessYaml } from "../src/profiles.js";
import { trustFromStatus } from "../src/trust.js";
import { StaticSource } from "../src/source.js";
import { validateHarnessYaml } from "@harness-kit/core";
import type { MarketplaceData } from "../src/types.js";

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

let cached: MarketplaceData | undefined;
async function getData(): Promise<MarketplaceData> {
  cached ??= await generateMarketplaceData(repoRoot);
  return cached;
}

describe("generateMarketplaceData", () => {
  it("emits every plugin from marketplace.json", async () => {
    const data = await getData();
    expect(data.plugins.length).toBe(17);
    expect(data.owner).toBe("harnessprotocol");
    expect(data.marketplaceName).toBe("harness-kit");
  });

  it("references only known categories", async () => {
    const data = await getData();
    const known = new Set(data.categories.map((c) => c.slug));
    for (const plugin of data.plugins) {
      expect(known, `${plugin.name} → ${plugin.category}`).toContain(plugin.category);
    }
  });

  it("sorts categories by display order", async () => {
    const data = await getData();
    const orders = data.categories.map((c) => c.displayOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("builds well-formed install commands", async () => {
    const data = await getData();
    for (const plugin of data.plugins) {
      expect(plugin.installCommand).toBe(`/plugin install ${plugin.name}@harness-kit`);
    }
  });

  it("ran the security scanner for every plugin", async () => {
    const data = await getData();
    for (const plugin of data.plugins) {
      expect(plugin.security.status).toBeDefined();
      expect(plugin.security.scanDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(plugin.security.trust).toBe(trustFromStatus(plugin.security.status));
    }
  });

  it("enumerates skill directories that differ from the plugin name", async () => {
    const data = await getData();
    const membrain = data.plugins.find((p) => p.name === "membrain");
    expect(membrain?.skills.map((s) => s.dir)).toEqual(["memory"]);

    const harnessShare = data.plugins.find((p) => p.name === "harness-share");
    expect(harnessShare?.skills.length).toBe(5);
  });

  it("captures mcp servers and env requirements", async () => {
    const data = await getData();
    const membrain = data.plugins.find((p) => p.name === "membrain");
    expect(membrain?.mcp).toEqual({ command: "mem", args: ["mcp"], transport: "stdio" });

    const research = data.plugins.find((p) => p.name === "research");
    expect(research?.requiresEnv[0]?.name).toBe("GH_TOKEN");
    expect(research?.skills.every((s) => s.dependencies === "python>=3.10")).toBe(true);
  });

  it("tags every plugin as a first-party source", async () => {
    const data = await getData();
    expect(data.plugins.every((p) => p.sourceId === "first-party")).toBe(true);
  });
});

describe("parseSkillMarkdown", () => {
  it("parses descriptions containing colons without a strict YAML failure", () => {
    const raw = [
      "---",
      "name: harness-import",
      "description: Use when user invokes /harness-import: install plugins from a config",
      "---",
      "",
      "# Body here",
    ].join("\n");
    const { frontmatter, body } = parseSkillMarkdown(raw);
    expect(frontmatter.name).toBe("harness-import");
    expect(frontmatter.description).toBe(
      "Use when user invokes /harness-import: install plugins from a config",
    );
    expect(body).toBe("# Body here");
  });

  it("returns the whole input as body when there is no frontmatter", () => {
    const { frontmatter, body } = parseSkillMarkdown("# Just a heading");
    expect(frontmatter).toEqual({});
    expect(body).toBe("# Just a heading");
  });
});

describe("StaticSource", () => {
  it("exposes plugins through the MarketplaceSource interface", async () => {
    const data = await getData();
    const source = new StaticSource(data);
    expect(source.id).toBe("first-party");
    expect(source.listPlugins()).toBe(data.plugins);
  });
});

it("finds the repo root from a nested directory", () => {
  expect(findRepoRoot(join(repoRoot, "packages", "marketplace-data", "src"))).toBe(repoRoot);
});

// ── Profile tests ─────────────────────────────────────────────

describe("profiles", () => {
  it("emits 3 profiles (data-engineer, full-stack-engineer, research-knowledge)", async () => {
    const data = await getData();
    expect(data.profiles).toBeDefined();
    expect(data.profiles.length).toBe(3);
    const slugs = data.profiles.map((p) => p.slug).sort();
    expect(slugs).toEqual(["data-engineer", "full-stack-engineer", "research-knowledge"]);
  });

  it("resolves all profile components against marketplace plugins", async () => {
    const data = await getData();
    for (const profile of data.profiles) {
      for (const ref of profile.plugins) {
        expect(
          ref.resolved,
          `Profile "${profile.name}": component "${ref.name}" should resolve`,
        ).toBe(true);
        expect(ref.slug).toBeDefined();
        expect(ref.category).toBeDefined();
        expect(ref.trust).toBeDefined();
      }
    }
  });

  it("sets liveVersion from marketplace plugins (not stale profile pin)", async () => {
    const data = await getData();
    for (const profile of data.profiles) {
      for (const ref of profile.plugins) {
        if (!ref.resolved) continue;
        const livePlugin = data.plugins.find((p) => p.name === ref.name);
        expect(ref.liveVersion).toBe(livePlugin?.version);
      }
    }
  });

  it("computes aggregateTrust as worst-case across resolved plugins", async () => {
    const data = await getData();
    const severityOf = (t: string) =>
      ({ warning: 3, caution: 2, unscanned: 1, verified: 0 })[t] ?? -1;

    for (const profile of data.profiles) {
      const maxSeverity = profile.plugins
        .filter((r) => r.resolved && r.trust)
        .reduce((max, r) => Math.max(max, severityOf(r.trust!)), 0);
      const expectedSeverity = severityOf(profile.aggregateTrust);
      expect(
        expectedSeverity,
        `Profile "${profile.name}" aggregateTrust severity should be >= per-plugin max`,
      ).toBeGreaterThanOrEqual(maxSeverity);
    }
  });

  it("emits a valid v1 harness.yaml for every profile", async () => {
    const data = await getData();
    for (const profile of data.profiles) {
      const result = validateHarnessYaml(profile.harnessYaml);
      expect(
        result.valid,
        `Profile "${profile.name}" harnessYaml validation errors: ${result.errors
          .map((e) => `${e.path}: ${e.message}`)
          .join("; ")}`,
      ).toBe(true);
    }
  });

  it("harnessYaml includes only resolved plugins with live versions", async () => {
    const data = await getData();
    for (const profile of data.profiles) {
      // Every resolved component appears in the harnessYaml
      const resolved = profile.plugins.filter((r) => r.resolved);
      for (const ref of resolved) {
        expect(profile.harnessYaml).toContain(`name: ${ref.name}`);
        expect(profile.harnessYaml).toContain(`source: harnessprotocol/harness-kit`);
        // Uses live version, not profile-pinned version
        if (ref.liveVersion) {
          expect(profile.harnessYaml).toContain(`version: "${ref.liveVersion}"`);
        }
      }
    }
  });

  it("derives a human-readable persona from the profile name", async () => {
    const data = await getData();
    const byName = Object.fromEntries(data.profiles.map((p) => [p.name, p.persona]));
    expect(byName["data-engineer"]).toBe("Data Engineer");
    expect(byName["full-stack-engineer"]).toBe("Full Stack Engineer");
    expect(byName["research-knowledge"]).toBe("Research Knowledge");
  });

  it("preserves knowledge and rules from profile YAML", async () => {
    const data = await getData();
    const fullStack = data.profiles.find((p) => p.name === "full-stack-engineer");
    expect(fullStack?.knowledge?.backend).toBe("memory-md");
    expect(fullStack?.rules.length).toBeGreaterThan(0);

    const dataEngineer = data.profiles.find((p) => p.name === "data-engineer");
    expect(dataEngineer?.knowledge?.backend).toBe("memory-md");
    expect(dataEngineer?.knowledge?.seedDocs.length).toBeGreaterThan(0);
    expect(dataEngineer?.rules.length).toBeGreaterThan(0);
  });

  it("profiles are sorted by name", async () => {
    const data = await getData();
    const names = data.profiles.map((p) => p.name);
    expect(names).toEqual([...names].sort());
  });

  it("tags all profiles as first-party", async () => {
    const data = await getData();
    expect(data.profiles.every((p) => p.sourceId === "first-party")).toBe(true);
  });
});

describe("readProfiles — unresolved component handling", () => {
  it("marks missing components as resolved: false and degrades aggregateTrust", async () => {
    // Simulate a plugin set that is missing some components from a profile
    const { readProfiles } = await import("../src/profiles.js");
    const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

    // Pass a plugin list that only contains one of the data-engineer components
    const partialPlugins = (await getData()).plugins.filter((p) => p.name === "review");

    const profiles = await readProfiles(repoRoot, partialPlugins);
    const de = profiles.find((p) => p.name === "data-engineer");
    expect(de).toBeDefined();

    // All non-"review" components should be unresolved
    const unresolvedRefs = de!.plugins.filter((r) => !r.resolved);
    expect(unresolvedRefs.length).toBeGreaterThan(0);

    // Unresolved refs should push aggregate trust to at least caution
    const severity = { warning: 3, caution: 2, unscanned: 1, verified: 0 };
    expect(severity[de!.aggregateTrust]).toBeGreaterThanOrEqual(severity["caution"]);

    // Trust breakdown: unresolved refs counted under cautionCount (not unscannedCount)
    expect(de!.security.cautionCount).toBeGreaterThanOrEqual(unresolvedRefs.length);
  });

  it("throws in strict mode when a component is unresolved", async () => {
    const { readProfiles } = await import("../src/profiles.js");
    const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

    // Empty plugin list — every component will be unresolved
    await expect(readProfiles(repoRoot, [], /* strict */ true)).rejects.toThrow(
      /not found in marketplace\.json/,
    );
  });
});

describe("buildHarnessYaml (unit)", () => {
  const PROFILE_YAML = {
    name: "test-profile",
    description: "A minimal test profile for unit testing the YAML builder.",
    author: { name: "testauthor" },
    components: [],
    rules: ["Always write tests first", "Review before merging"],
  };

  it("produces YAML that validates against the v1 schema", () => {
    const yaml = buildHarnessYaml(PROFILE_YAML, [
      { name: "review", version: "0.3.0" },
    ]);
    const result = validateHarnessYaml(yaml);
    expect(result.valid, result.errors.map((e) => e.message).join("; ")).toBe(true);
  });

  it("includes rules in instructions.behavioral", () => {
    const yaml = buildHarnessYaml(PROFILE_YAML, []);
    expect(yaml).toContain("instructions:");
    expect(yaml).toContain("behavioral:");
    expect(yaml).toContain("- Always write tests first");
    expect(yaml).toContain("- Review before merging");
  });

  it("truncates description to 256 chars max", () => {
    const longDesc = "x".repeat(300);
    const yaml = buildHarnessYaml({ ...PROFILE_YAML, description: longDesc }, []);
    const result = validateHarnessYaml(yaml);
    expect(result.valid, result.errors.map((e) => e.message).join("; ")).toBe(true);
  });

  it("omits plugins block when no resolved plugins passed", () => {
    const yaml = buildHarnessYaml({ ...PROFILE_YAML, rules: [] }, []);
    expect(yaml).not.toContain("plugins:");
    expect(yaml).not.toContain("instructions:");
  });
});
