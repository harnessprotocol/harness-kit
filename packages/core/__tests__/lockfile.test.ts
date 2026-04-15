import { describe, it, expect } from "vitest";
import {
  readLockFile,
  writeLockFile,
  isLockFileFresh,
  getMissingLockEntries,
} from "../src/compile/lockfile.js";
import type { LockFile } from "../src/compile/lockfile.js";
import type { HarnessConfig } from "../src/types.js";

function makeConfig(plugins: Array<{ name: string; source: string }> = []): HarnessConfig {
  return {
    version: "1",
    metadata: { name: "test", description: "test" },
    plugins: plugins.map((p) => ({ ...p })),
  };
}

function makeLock(plugins: Partial<LockFile["plugins"][0]>[] = []): LockFile {
  return {
    version: 1,
    plugins: plugins.map((p) => ({
      name: p.name ?? "plugin",
      source: p.source ?? "owner/repo",
      commit: p.commit ?? "abc1234",
      contentHash: p.contentHash ?? "sha256:aabbcc",
      installedName: p.installedName ?? p.name ?? "plugin",
    })),
  };
}

// ── writeLockFile / readLockFile round-trip ──────────────────

describe("writeLockFile / readLockFile", () => {
  it("round-trips a lock with plugins", () => {
    const lock = makeLock([
      { name: "research", source: "harnessprotocol/harness-kit", commit: "abc1234" },
    ]);
    const yaml = writeLockFile(lock);
    const parsed = readLockFile(yaml);

    expect(parsed.version).toBe(1);
    expect(parsed.plugins).toHaveLength(1);
    expect(parsed.plugins[0].name).toBe("research");
    expect(parsed.plugins[0].commit).toBe("abc1234");
  });

  it("round-trips an empty lock", () => {
    const lock: LockFile = { version: 1, plugins: [] };
    const yaml = writeLockFile(lock);
    const parsed = readLockFile(yaml);
    expect(parsed.plugins).toHaveLength(0);
  });

  it("writes a header comment", () => {
    const yaml = writeLockFile({ version: 1, plugins: [] });
    expect(yaml).toContain("# harness.lock");
    expect(yaml).toContain("do not edit by hand");
  });

  it("preserves path field for local plugins", () => {
    const lock: LockFile = {
      version: 1,
      plugins: [{
        name: "local-plugin",
        source: "./plugins/local",
        commit: "local",
        contentHash: "sha256:aabbcc",
        installedName: "local-plugin",
        path: "/project/plugins/local",
      }],
    };
    const yaml = writeLockFile(lock);
    const parsed = readLockFile(yaml);
    expect(parsed.plugins[0].path).toBe("/project/plugins/local");
  });

  it("throws on invalid format", () => {
    expect(() => readLockFile("not yaml: {{{")).toThrow();
  });

  it("throws on unsupported version", () => {
    expect(() => readLockFile("version: 2\nplugins: []")).toThrow(
      "unsupported version",
    );
  });
});

// ── isLockFileFresh ──────────────────────────────────────────

describe("isLockFileFresh", () => {
  it("returns true when all config plugins are in the lock", () => {
    const lock = makeLock([{ name: "research" }, { name: "orient" }]);
    const config = makeConfig([
      { name: "research", source: "harnessprotocol/harness-kit" },
      { name: "orient", source: "harnessprotocol/harness-kit" },
    ]);
    expect(isLockFileFresh(lock, config)).toBe(true);
  });

  it("returns false when a declared plugin is missing from lock", () => {
    const lock = makeLock([{ name: "research" }]);
    const config = makeConfig([
      { name: "research", source: "harnessprotocol/harness-kit" },
      { name: "orient", source: "harnessprotocol/harness-kit" },
    ]);
    expect(isLockFileFresh(lock, config)).toBe(false);
  });

  it("returns true when config has no plugins", () => {
    const lock = makeLock([]);
    const config = makeConfig([]);
    expect(isLockFileFresh(lock, config)).toBe(true);
  });

  it("returns true when lock has extra (removed) plugins", () => {
    // Stale entries in lock are not a failure
    const lock = makeLock([{ name: "research" }, { name: "old-plugin" }]);
    const config = makeConfig([{ name: "research", source: "harnessprotocol/harness-kit" }]);
    expect(isLockFileFresh(lock, config)).toBe(true);
  });
});

// ── getMissingLockEntries ────────────────────────────────────

describe("getMissingLockEntries", () => {
  it("returns names of plugins missing from lock", () => {
    const lock = makeLock([{ name: "research" }]);
    const config = makeConfig([
      { name: "research", source: "harnessprotocol/harness-kit" },
      { name: "orient", source: "harnessprotocol/harness-kit" },
    ]);
    expect(getMissingLockEntries(lock, config)).toEqual(["orient"]);
  });

  it("returns empty array when all plugins are locked", () => {
    const lock = makeLock([{ name: "research" }]);
    const config = makeConfig([{ name: "research", source: "harnessprotocol/harness-kit" }]);
    expect(getMissingLockEntries(lock, config)).toHaveLength(0);
  });
});
