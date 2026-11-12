import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The fs plugin's rename and remove are not granted to the webview. The
 * provider must reach the filesystem for those two only through the guarded
 * Rust commands; the plugin mock throws if it is asked to rename or remove.
 */
const invoke = vi.hoisted(() => vi.fn());
const lstat = vi.hoisted(() => vi.fn());
const mkdir = vi.hoisted(() => vi.fn());
const writeTextFile = vi.hoisted(() => vi.fn());
const existsPlugin = vi.hoisted(() => vi.fn());
import errors from "../../../test-fixtures/errors.json";

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: async () => "/home/user" }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: async () => "",
  writeTextFile,
  exists: existsPlugin,
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
    existsPlugin.mockReset();
    existsPlugin.mockResolvedValue(true);
  });

  it("treats exists() on a forbidden path as absent, using the string the runtime really rejects with", async () => {
    // The fs plugin rejects with a bare string, not an Error.
    existsPlugin.mockRejectedValue(errors.forbiddenPath);
    const fs = new TauriFsProvider("/home/user");
    await expect(fs.exists("/home/user/.zshrc")).resolves.toBe(false);
    expect(existsPlugin).toHaveBeenCalledWith("/home/user/.zshrc");
  });

  it("returns the plugin's answer when exists() is allowed", async () => {
    const fs = new TauriFsProvider("/home/user");
    existsPlugin.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(fs.exists("/home/user/.claude")).resolves.toBe(true);
    await expect(fs.exists("/home/user/.claude/nope")).resolves.toBe(false);
  });

  it("surfaces the real ACL-denied string from a guarded write unchanged", async () => {
    invoke.mockRejectedValue(errors.commandNotAllowed);
    const fs = new TauriFsProvider("/home/user");
    await expect(fs.writeFile("/home/user/.claude/a.harness-tmp-1", "x")).rejects.toBe(
      errors.commandNotAllowed,
    );
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

  it("never deletes the source of a refused rename unless it is an engine temp file", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "guarded_rename_file") throw "refused";
    });
    const fs = new TauriFsProvider("/home/user");
    await expect(fs.renameFile("/home/user/.claude.json", "/home/user/.claude/x")).rejects.toBe("refused");
    expect(invoke).not.toHaveBeenCalledWith("guarded_remove_file", expect.anything());
  });

  it("treats only the final path segment as a temp name when cleaning up a refused rename", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "guarded_rename_file") throw "refused";
    });
    const fs = new TauriFsProvider("/home/user");
    // The marker is in a directory name, not in the file's own name.
    await expect(
      fs.renameFile("/home/user/x.harness-tmp-1/precious.md", "/home/user/x.harness-tmp-1/other.md"),
    ).rejects.toBe("refused");
    expect(invoke).not.toHaveBeenCalledWith("guarded_remove_file", expect.anything());
  });

  it("writes through the guarded Rust command, never the fs plugin", async () => {
    const fs = new TauriFsProvider("/home/user");
    await fs.writeFile("/home/user/.claude/a.harness-tmp-1", "content");
    expect(invoke).toHaveBeenCalledWith("guarded_write_file", {
      path: "/home/user/.claude/a.harness-tmp-1",
      content: "content",
    });
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("surfaces a Rust refusal of a write", async () => {
    invoke.mockRejectedValue("the webview may only write the engine's temp files");
    const fs = new TauriFsProvider("/home/user");
    await expect(fs.writeFile("/home/user/.claude/settings.json", "x")).rejects.toBe(
      "the webview may only write the engine's temp files",
    );
  });

  it("still rethrows the rename error when the temp cleanup also fails", async () => {
    invoke.mockRejectedValue("refused");
    const fs = new TauriFsProvider("/home/user");
    await expect(fs.renameFile("/home/user/a.harness-tmp-1", "/home/user/a")).rejects.toBe("refused");
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
