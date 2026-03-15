import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseHarness } from "../src/parser/parse-harness.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf-8");
}

describe("parseHarness", () => {
  it("parses a valid harness.yaml", () => {
    const { config, isLegacyFormat } = parseHarness(
      loadFixture("valid-harness.yaml"),
    );
    expect(isLegacyFormat).toBe(false);
    expect(config.version).toBe("1");
    expect(config.metadata?.name).toBe("my-harness");
    expect(config.plugins).toHaveLength(2);
    expect(config["mcp-servers"]).toBeDefined();
    expect(config.instructions?.operational).toContain("pnpm build");
  });

  it("detects legacy format (integer version)", () => {
    const { config, isLegacyFormat } = parseHarness(
      loadFixture("legacy-harness.yaml"),
    );
    expect(isLegacyFormat).toBe(true);
    // version is parsed as integer by YAML
    expect(config.version).toBe(1 as unknown as string);
  });

  it("throws on invalid YAML syntax", () => {
    expect(() => parseHarness("{ invalid yaml: [")).toThrow("YAML syntax error");
  });

  it("throws on empty content", () => {
    expect(() => parseHarness("")).toThrow("empty");
  });

  it("throws on non-object content", () => {
    expect(() => parseHarness("just a string")).toThrow("does not contain a YAML mapping");
  });

  it("parses mcp-servers with stdio transport", () => {
    const { config } = parseHarness(loadFixture("valid-harness.yaml"));
    const servers = config["mcp-servers"];
    expect(servers).toBeDefined();
    expect(servers!.postgres).toBeDefined();
    expect(servers!.postgres.transport).toBe("stdio");
  });

  it("parses permissions", () => {
    const { config } = parseHarness(loadFixture("valid-harness.yaml"));
    expect(config.permissions?.tools?.allow).toContain("Read");
    expect(config.permissions?.tools?.deny).toContain("mcp__postgres__drop_table");
    expect(config.permissions?.paths?.writable).toContain("sql/");
  });
});
