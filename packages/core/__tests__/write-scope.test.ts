import { describe, expect, it } from "vitest";
import { applyFileTransaction } from "../src/index.js";
import {
  createHomeTransactionRoot,
  homeWriteScope,
  isWritableHomePath,
} from "../src/surfaces/write-scope.js";
import { SURFACES } from "../src/surfaces/registry.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

describe("home write scope (AC-31)", () => {
  const scope = homeWriteScope("darwin");

  it("derives the allowlist from the registry rather than a hardcoded list", () => {
    // Every user-scope store the registry declares must be reachable; if a
    // descriptor gains a store, this passes without touching write-scope.ts.
    for (const surface of SURFACES) {
      for (const store of surface.stores) {
        if (store.scope !== "user") continue;
        const path = store.pathByPlatform?.darwin ?? store.path;
        // A directory store is never written *at* its own path — only
        // beneath it — so reachability is the property, not exact acceptance.
        const reachable =
          isWritableHomePath(path, scope) || isWritableHomePath(`${path}/child.md`, scope);
        expect(
          reachable,
          `${surface.id} declares ${path} but the write scope cannot reach it`,
        ).toBe(true);
      }
    }
  });

  it("accepts a declared file store", () => {
    expect(isWritableHomePath(".claude.json", scope)).toBe(true);
    expect(isWritableHomePath(".codex/config.toml", scope)).toBe(true);
  });

  it("rejects an undeclared sibling of a declared store", () => {
    expect(isWritableHomePath(".claude/settings.local.json", scope)).toBe(false);
    expect(isWritableHomePath(".ssh/id_rsa", scope)).toBe(false);
    expect(isWritableHomePath(".zshrc", scope)).toBe(false);
  });

  it("rejects a path that merely shares a prefix with a declared file", () => {
    // ".claude.json.bak" starts with ".claude.json" as a string but is a
    // different file — prefix matching has to be path-segment aware.
    expect(isWritableHomePath(".claude.json.bak", scope)).toBe(false);
    expect(isWritableHomePath(".claude.jsonx", scope)).toBe(false);
  });

  it("accepts files beneath a declared directory store", () => {
    expect(isWritableHomePath(".claude/skills/review/SKILL.md", scope)).toBe(true);
    expect(isWritableHomePath(".agents/skills/review/SKILL.md", scope)).toBe(true);
  });

  it("rejects a directory-store lookalike", () => {
    expect(isWritableHomePath(".claude/skillsets/x.md", scope)).toBe(false);
  });

  it("honours platform overrides", () => {
    const win = homeWriteScope("win32");
    // Claude Desktop's config lives somewhere different per platform; the
    // darwin path must not be writable when running on win32.
    const darwinOnly = "Library/Application Support/Claude/claude_desktop_config.json";
    expect(isWritableHomePath(darwinOnly, scope)).toBe(true);
    expect(isWritableHomePath(darwinOnly, win)).toBe(false);
  });

  it("refuses traversal and absolute forms outright", () => {
    expect(isWritableHomePath("../.ssh/id_rsa", scope)).toBe(false);
    expect(isWritableHomePath("/etc/passwd", scope)).toBe(false);
    expect(isWritableHomePath("", scope)).toBe(false);
  });
});

describe("home root wired into transactions (AC-31)", () => {
  it("applies a change to a declared store", async () => {
    const fs = new MockFsProvider({ "/home/user/.claude.json": "{}" });
    const result = await applyFileTransaction(
      [{ root: "home", path: ".claude.json", before: "{}", after: '{"a":1}' }],
      {
        fs,
        timestamp: "ok",
        roots: { home: createHomeTransactionRoot("/home/user", "darwin") },
      },
    );
    expect(result.committed).toBe(true);
    expect(fs.getFile("/home/user/.claude.json")).toBe('{"a":1}');
  });

  it("refuses an undeclared path with no filesystem side effects", async () => {
    const fs = new MockFsProvider({ "/home/user/.zshrc": "export A=1" });
    await expect(applyFileTransaction(
      [{ root: "home", path: ".zshrc", before: "export A=1", after: "export A=2" }],
      {
        fs,
        timestamp: "denied",
        roots: { home: createHomeTransactionRoot("/home/user", "darwin") },
      },
    )).rejects.toThrow(/not a config store|allowlist|declare/i);
    expect(fs.getFile("/home/user/.zshrc")).toBe("export A=1");
    // Rejected before backups exist.
    expect(fs.getFile("/home/user/.harness/backups/denied/.zshrc")).toBeUndefined();
  });

  it("still allows unrestricted project-root writes", async () => {
    const fs = new MockFsProvider({ "/project/anything.txt": "a" });
    const result = await applyFileTransaction(
      [{ path: "anything.txt", before: "a", after: "b" }],
      { fs, timestamp: "project", roots: { home: createHomeTransactionRoot("/home/user", "darwin") } },
    );
    expect(result.committed).toBe(true);
  });
});
