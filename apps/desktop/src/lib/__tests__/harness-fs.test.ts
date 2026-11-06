import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The fs plugin's rename and remove are not granted to the webview. The
 * provider must reach the filesystem for those two only through the guarded
 * Rust commands; the plugin mock throws if it is asked to rename or remove.
 */
const invoke = vi.hoisted(() => vi.fn());
const lstat = vi.hoisted(() => vi.fn());
const mkdir = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: async () => "/home/user" }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: async () => "",
  writeTextFile: async () => {},
  exists: async () => true,
  readDir: async () => [],
  lstat,
  mkdir,
  rename: () => {
    throw new Error("the webview must not call plugin rename");
  },
  remove: () => {
    throw new Error("the webview must not call plugin remove");
  },
}));

const { TauriFsProvider } = await import("../harness-fs");

describe("TauriFsProvider", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    lstat.mockReset();
    mkdir.mockReset();
  });

  it("renames through the guarded Rust command", async () => {
    const fs = new TauriFsProvider("/home/user");
    await fs.renameFile("/home/user/.claude/a.harness-tmp-1", "/home/user/.claude/a");
    expect(invoke).toHaveBeenCalledWith("guarded_rename_file", {
      from: "/home/user/.claude/a.harness-tmp-1",
      to: "/home/user/.claude/a",
    });
  });

  it("removes the temp file and rethrows the original error when a rename is refused", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "guarded_rename_file") throw "refused: target changed";
    });
    const fs = new TauriFsProvider("/home/user");
    await expect(
      fs.renameFile("/home/user/.claude/a.harness-tmp-1", "/home/user/.claude/a"),
    ).rejects.toBe("refused: target changed");
    expect(invoke).toHaveBeenCalledWith("guarded_remove_file", {
      path: "/home/user/.claude/a.harness-tmp-1",
    });
  });

  it("still rethrows the rename error when the temp cleanup also fails", async () => {
    invoke.mockRejectedValue("refused");
    const fs = new TauriFsProvider("/home/user");
    await expect(fs.renameFile("/home/user/a.tmp", "/home/user/a")).rejects.toBe("refused");
  });

  it("removes through the guarded Rust command", async () => {
    const fs = new TauriFsProvider("/home/user");
    await fs.removeFile("/home/user/.claude/a");
    expect(invoke).toHaveBeenCalledWith("guarded_remove_file", { path: "/home/user/.claude/a" });
  });

  it("surfaces a Rust refusal instead of swallowing it", async () => {
    invoke.mockRejectedValue("outside the roots this app may modify");
    const fs = new TauriFsProvider("/home/user");
    await expect(fs.removeFile("/etc/passwd")).rejects.toBe("outside the roots this app may modify");
  });

  it("still uses the plugin for lstat and mkdir, which the capability grants", async () => {
    lstat.mockResolvedValue({ isDirectory: false, isSymlink: true });
    const fs = new TauriFsProvider("/home/user");
    expect(await fs.isSymlink("/home/user/.claude/x")).toBe(true);
    expect(await fs.isDirectory("/home/user/.claude/x")).toBe(false);
    await fs.mkdir("/home/user/.claude/new", { recursive: true });
    expect(mkdir).toHaveBeenCalledWith("/home/user/.claude/new", { recursive: true });
  });
});
