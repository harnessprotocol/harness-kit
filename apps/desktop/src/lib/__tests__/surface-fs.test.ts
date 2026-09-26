import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression for the single-file-store Apply failure: core's engine staged
 * `<store>.harness-tmp-*` through this provider, and the Rust allowlist (which
 * accepts an exact declared file, not a suffix of one) refused it — so every
 * ~/.claude.json, config.toml and mcp.json apply failed before touching the
 * target. Unit tests mocked `invoke` and never saw it, so this one gives the
 * mock the Rust command's actual rule.
 */
const invoke = vi.hoisted(() => vi.fn());
const files = vi.hoisted(() => new Map<string, string>());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: async () => "/home/user" }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: async (path: string) => {
    const value = files.get(path);
    if (value === undefined) throw new Error(`ENOENT ${path}`);
    return value;
  },
  exists: async (path: string) => files.has(path),
  lstat: async () => ({ isDirectory: false, isSymlink: false }),
  writeTextFile: async () => {
    throw new Error("the webview must not write directly; the fs plugin has no write scope");
  },
  rename: async () => {
    throw new Error("the webview must not rename directly");
  },
  remove: async () => {
    throw new Error("the webview must not remove directly");
  },
  mkdir: async () => {},
  readDir: async () => [],
}));

const { applyFileTransaction } = await import("@harness-kit/core");
const { TauriSurfaceFsProvider } = await import("../surface-fs");

const HOME = "/home/user";

/** The Rust command's rule, reduced: an exact declared file, or under .harness/. */
function fakeRust(declared: string[]) {
  invoke.mockImplementation(
    async (
      command: string,
      args: { files: { relativePath: string; content: string | null }[] },
    ) => {
      if (command !== "apply_surface_transaction") throw new Error(`unexpected command ${command}`);
      for (const file of args.files) {
        const allowed = declared.includes(file.relativePath) || file.relativePath.startsWith(".harness/");
        if (!allowed) throw new Error(`Refusing to write '${file.relativePath}': not a config store`);
      }
      for (const file of args.files) {
        if (file.content === null) files.delete(`${HOME}/${file.relativePath}`);
        else files.set(`${HOME}/${file.relativePath}`, file.content);
      }
      return args.files.map((file) => file.relativePath);
    },
  );
}

const paths = () => invoke.mock.calls.flatMap(([, args]) => args.files.map((f: { relativePath: string }) => f.relativePath));

describe("TauriSurfaceFsProvider", () => {
  beforeEach(() => {
    invoke.mockReset();
    files.clear();
  });

  it("never sends a temp path to the Rust command when the engine writes a single-file store", async () => {
    files.set(`${HOME}/.claude.json`, '{"mcpServers":{}}');
    fakeRust([".claude.json"]);

    const result = await applyFileTransaction(
      [{ root: "home", path: ".claude.json", before: '{"mcpServers":{}}', after: '{"mcpServers":{"a":{}}}' }],
      {
        fs: new TauriSurfaceFsProvider(HOME),
        timestamp: "2026-09-26T00-00-00-000Z-app",
        roots: { home: { absolutePath: HOME } },
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.committed).toBe(true);
    expect(files.get(`${HOME}/.claude.json`)).toBe('{"mcpServers":{"a":{}}}');
    expect(paths().filter((path) => path.includes(".harness-tmp-"))).toEqual([]);
    // The destination itself was written, plus the preimage backup and manifest.
    expect(paths()).toContain(".claude.json");
    expect(paths().some((path) => path.startsWith(".harness/backups/") && path.endsWith("/.claude.json"))).toBe(true);
  });

  it("rolls a failed apply back to the preimage through the same path", async () => {
    files.set(`${HOME}/.claude.json`, "before");
    files.set(`${HOME}/.cursor/mcp.json`, "cursor-before");
    fakeRust([".claude.json", ".cursor/mcp.json"]);
    const rust = invoke.getMockImplementation()!;
    // The second store's write fails after the first has landed.
    invoke.mockImplementation(async (command: string, args: { files: { relativePath: string; content: string | null }[] }) => {
      const [file] = args.files;
      if (file?.relativePath === ".cursor/mcp.json" && file.content === "cursor-after") throw new Error("disk full");
      return rust(command, args);
    });

    const result = await applyFileTransaction(
      [
        { root: "home", path: ".claude.json", before: "before", after: "after" },
        { root: "home", path: ".cursor/mcp.json", before: "cursor-before", after: "cursor-after" },
      ],
      {
        fs: new TauriSurfaceFsProvider(HOME),
        timestamp: "2026-09-26T00-00-01-000Z-app",
        roots: { home: { absolutePath: HOME } },
      },
    );

    expect(result.committed).toBe(false);
    expect(result.rolledBack).toContain(".claude.json");
    expect(files.get(`${HOME}/.claude.json`)).toBe("before");
    expect(files.get(`${HOME}/.cursor/mcp.json`)).toBe("cursor-before");
  });

  it("turns the engine's `replaces` into the command's expectedSha256", async () => {
    fakeRust([".claude.json"]);
    const provider = new TauriSurfaceFsProvider(HOME);
    const sha = async (text: string) =>
      Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");

    await provider.atomicWriteFile(`${HOME}/.claude.json`, "new", { replaces: "old" });
    await provider.atomicWriteFile(`${HOME}/.claude.json`, "new", { replaces: null });
    await provider.atomicWriteFile(`${HOME}/.claude.json`, "new", { mode: 0o600 });

    const sent = invoke.mock.calls.map(([, args]) => args.files[0].expectedSha256);
    expect(sent).toEqual([await sha("old"), "absent", undefined]);
  });

  it("refuses to emulate a rename", async () => {
    await expect(new TauriSurfaceFsProvider(HOME).renameFile()).rejects.toThrow(/no rename/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses a path outside the home directory", async () => {
    await expect(new TauriSurfaceFsProvider(HOME).atomicWriteFile("/etc/passwd", "x")).rejects.toThrow(/outside the home/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
