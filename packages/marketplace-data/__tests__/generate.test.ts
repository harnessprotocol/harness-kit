import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot, generateMarketplaceData } from "../src/generate.js";
import { parseSkillMarkdown } from "../src/read-skills.js";
import { trustFromStatus } from "../src/trust.js";
import { StaticSource } from "../src/source.js";
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
    expect(data.plugins.length).toBe(18);
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
