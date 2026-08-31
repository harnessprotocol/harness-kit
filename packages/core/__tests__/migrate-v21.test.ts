import { describe, expect, it } from "vitest";
import {
  CURRENT_PROTOCOL_VERSION,
  LEGACY_SURFACE_RENAMES,
  migrateHarnessV2ToV21,
  migrateToCurrent,
  parseHarness,
  validateHarness,
} from "../src/index.js";
import type { HarnessConfig } from "../src/index.js";

function v2Config(extra: Partial<HarnessConfig> = {}): HarnessConfig {
  return {
    version: "2",
    kind: "profile",
    scope: "project",
    metadata: { name: "migrate-me", description: "Migration fixture" },
    ...extra,
  };
}

describe("CURRENT_PROTOCOL_VERSION", () => {
  it("is 2.1", () => {
    expect(CURRENT_PROTOCOL_VERSION).toBe("2.1");
  });

  it("maps the legacy copilot spelling to copilot-vscode", () => {
    expect(LEGACY_SURFACE_RENAMES).toEqual({ copilot: "copilot-vscode" });
  });
});

describe("migrateHarnessV2ToV21", () => {
  it("renames the legacy copilot vendor key and bumps the version", () => {
    const original = v2Config({
      vendor: {
        copilot: { "chat.mode": "agent" },
        codex: { model: "gpt-5" },
      } as HarnessConfig["vendor"],
      permissions: { tools: { deny: ["Bash"] } },
    });
    const migration = migrateHarnessV2ToV21(original);

    expect(migration.config.version).toBe("2.1");
    const vendor = migration.config.vendor as Record<string, unknown>;
    expect(vendor["copilot-vscode"]).toEqual({ "chat.mode": "agent" });
    expect(vendor).not.toHaveProperty("copilot");
    // Every other section rides along untouched.
    expect(vendor.codex).toEqual({ model: "gpt-5" });
    expect(migration.config.permissions).toEqual(original.permissions);
    expect(migration.config.metadata).toEqual(original.metadata);
    expect(migration.config.scope).toBe("project");
    // Changes describe each rename plus the version bump.
    expect(migration.changes).toEqual([
      'renamed vendor key "copilot" to "copilot-vscode"',
      "set protocol version to 2.1",
    ]);
  });

  it("never mutates its input", () => {
    const original = v2Config({
      vendor: { copilot: { "chat.mode": "agent" } } as HarnessConfig["vendor"],
    });
    const snapshot = structuredClone(original);
    migrateHarnessV2ToV21(original);
    expect(original).toEqual(snapshot);
  });

  it("bumps a plain v2 doc with no legacy vendor keys", () => {
    const migration = migrateHarnessV2ToV21(v2Config());
    expect(migration.config.version).toBe("2.1");
    expect(migration.changes).toEqual(["set protocol version to 2.1"]);
  });

  it("is idempotent — the second run is a by-reference no-op", () => {
    const first = migrateHarnessV2ToV21(
      v2Config({ vendor: { copilot: {} } as HarnessConfig["vendor"] }),
    );
    const second = migrateHarnessV2ToV21(first.config);
    expect(second.changes).toEqual([]);
    expect(second.config).toBe(first.config);
  });

  it("returns a v2.1 doc by reference with empty changes", () => {
    const original = v2Config({
      version: "2.1",
      vendor: { "copilot-vscode": { "chat.mode": "agent" } },
    });
    const migration = migrateHarnessV2ToV21(original);
    expect(migration.config).toBe(original);
    expect(migration.changes).toEqual([]);
  });

  it("leaves non-v2 docs untouched by reference", () => {
    const original: HarnessConfig = {
      version: "1",
      metadata: { name: "legacy", description: "Legacy" },
    };
    const migration = migrateHarnessV2ToV21(original);
    expect(migration.config).toBe(original);
    expect(migration.changes).toEqual([]);
  });

  it("merges a legacy copilot block into an existing copilot-vscode block, modern entries winning", () => {
    const migration = migrateHarnessV2ToV21(
      v2Config({
        vendor: {
          copilot: { "chat.mode": "ask", legacyOnly: true },
          "copilot-vscode": { "chat.mode": "agent" },
        } as HarnessConfig["vendor"],
      }),
    );
    const vendor = migration.config.vendor as Record<string, unknown>;
    expect(vendor["copilot-vscode"]).toEqual({ "chat.mode": "agent", legacyOnly: true });
    expect(vendor).not.toHaveProperty("copilot");
    expect(migration.changes[0]).toContain("merged");
  });
});

describe("migrateToCurrent", () => {
  it("chains a v1 doc all the way to 2.1 with concatenated changes", () => {
    const original: HarnessConfig = {
      version: "1",
      metadata: { name: "legacy", description: "Legacy" },
      permissions: { tools: { deny: ["Bash"] } },
    };
    const migration = migrateToCurrent(original);
    expect(original.version).toBe("1");
    expect(migration.config.version).toBe("2.1");
    expect(migration.config.scope).toBe("project");
    expect(migration.config.permissions).toEqual(original.permissions);
    expect(migration.changes).toContain("set protocol version to 2");
    expect(migration.changes).toContain("set protocol version to 2.1");
    expect(migration.changes.indexOf("set protocol version to 2")).toBeLessThan(
      migration.changes.indexOf("set protocol version to 2.1"),
    );
  });

  it("migrates a v2 doc to 2.1", () => {
    const migration = migrateToCurrent(
      v2Config({ vendor: { copilot: {} } as HarnessConfig["vendor"] }),
    );
    expect(migration.config.version).toBe("2.1");
    expect((migration.config.vendor as Record<string, unknown>)["copilot-vscode"]).toEqual({});
  });

  it("is a by-reference no-op for a doc already at 2.1", () => {
    const original = v2Config({ version: "2.1" });
    const migration = migrateToCurrent(original);
    expect(migration.config).toBe(original);
    expect(migration.changes).toEqual([]);
  });
});

describe("parseHarness v2 → v2.1 auto-migration", () => {
  const V2_YAML = [
    'version: "2"',
    "kind: profile",
    "scope: project",
    "metadata:",
    "  name: migrate-me",
    "  description: Migration fixture",
    "vendor:",
    "  copilot:",
    "    chat.mode: agent",
    "",
  ].join("\n");

  it("returns the migrated config and surfaces each change as a warning", () => {
    const { config, warnings } = parseHarness(V2_YAML);
    expect(config.version).toBe("2.1");
    const vendor = config.vendor as Record<string, unknown>;
    expect(vendor["copilot-vscode"]).toEqual({ "chat.mode": "agent" });
    expect(vendor).not.toHaveProperty("copilot");
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.includes('renamed vendor key "copilot" to "copilot-vscode"'))).toBe(true);
    expect(warnings.some((w) => w.includes("set protocol version to 2.1"))).toBe(true);
  });

  it("validates a v2 doc with a legacy copilot vendor key, then migrates cleanly", () => {
    const { config } = parseHarness(V2_YAML);
    // The original document validates as v2 (the legacy key is allowed there);
    // what parseHarness hands back has already been renamed, so it also passes
    // the stricter v2.1 rule rather than being rejected by it.
    expect(validateHarness(config)).toMatchObject({ valid: true, errors: [] });
  });

  it("round-trips a v2.1 doc with zero warnings", () => {
    const { config, warnings } = parseHarness(
      V2_YAML.replace('version: "2"', 'version: "2.1"').replace("  copilot:", "  copilot-vscode:"),
    );
    expect(config.version).toBe("2.1");
    expect(warnings).toEqual([]);
  });

  it("leaves v1 documents untouched with zero warnings", () => {
    const { config, warnings, isLegacyFormat } = parseHarness(
      ['version: "1"', "metadata:", "  name: legacy", "  description: Legacy", ""].join("\n"),
    );
    expect(config.version).toBe("1");
    expect(isLegacyFormat).toBe(false);
    expect(warnings).toEqual([]);
  });
});
