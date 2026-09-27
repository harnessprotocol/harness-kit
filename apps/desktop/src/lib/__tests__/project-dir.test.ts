import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  PROJECT_CHANGED_EVENT,
  expandStoredTildes,
  getCurrentProjectDir,
  getRecentProjectDirs,
  setCurrentProjectDir,
} from "../project-dir";

const mockGrantProjectScope = vi.fn();
vi.mock("../tauri", () => ({
  grantProjectScope: (...args: unknown[]) => mockGrantProjectScope(...args),
}));

const mockHomeDir = vi.fn();
vi.mock("@tauri-apps/api/path", () => ({
  homeDir: () => mockHomeDir(),
}));

describe("project-dir store (AC-17)", () => {
  beforeEach(() => {
    mockGrantProjectScope.mockReset();
    mockGrantProjectScope.mockResolvedValue(undefined);
    mockHomeDir.mockReset();
    mockHomeDir.mockResolvedValue("/Users/me");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores the head of the recent list when no current project was ever written", () => {
    localStorage.setItem("harness-kit-sync-recent-dirs", JSON.stringify(["/a", "/b"]));
    expect(getCurrentProjectDir()).toBe("/a");
  });

  it("stays cleared across a reload instead of falling back to a recent project", () => {
    setCurrentProjectDir("/a");
    setCurrentProjectDir(null);
    expect(getCurrentProjectDir()).toBeNull();
    expect(getRecentProjectDirs()).toEqual(["/a"]);
  });

  it("moves a chosen project to the front without duplicating it, grants it and announces it", () => {
    const heard = vi.fn();
    window.addEventListener(PROJECT_CHANGED_EVENT, heard);
    setCurrentProjectDir("/a");
    setCurrentProjectDir("/b");
    setCurrentProjectDir("/a");
    window.removeEventListener(PROJECT_CHANGED_EVENT, heard);

    expect(getRecentProjectDirs()).toEqual(["/a", "/b"]);
    expect(getCurrentProjectDir()).toBe("/a");
    expect(heard).toHaveBeenCalledTimes(3);
    expect(mockGrantProjectScope.mock.calls).toEqual([["/a"], ["/b"], ["/a"]]);
  });

  it("ignores a corrupt recent list", () => {
    localStorage.setItem("harness-kit-sync-recent-dirs", "{not json");
    expect(getRecentProjectDirs()).toEqual([]);
    expect(getCurrentProjectDir()).toBeNull();
  });

  it("keeps the choice for the session when storage refuses the write", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setCurrentProjectDir("/kept");
    expect(localStorage.getItem("harness-kit-current-project")).toBeNull();
    expect(getCurrentProjectDir()).toBe("/kept");
    setCurrentProjectDir(null);
    expect(getCurrentProjectDir()).toBeNull();
    vi.restoreAllMocks();
    // A later successful write takes over again.
    setCurrentProjectDir("/saved");
    expect(localStorage.getItem("harness-kit-current-project")).toBe("/saved");
    expect(getCurrentProjectDir()).toBe("/saved");
  });

  describe("`~` paths saved by older builds", () => {
    it("restores a `~` recent head as the absolute path, persisted, and announces it", async () => {
      localStorage.setItem(
        "harness-kit-sync-recent-dirs",
        JSON.stringify(["~/repos/app", "/abs/other", "~", "~bob/repo"]),
      );
      const heard = vi.fn();
      window.addEventListener(PROJECT_CHANGED_EVENT, heard);

      // Never handed out literally: plugin-fs would read `~/repos/app` as a
      // relative path and every project store would read absent.
      expect(getCurrentProjectDir()).toBeNull();
      expect(getRecentProjectDirs()).toEqual(["/abs/other"]);

      await waitFor(() => expect(getCurrentProjectDir()).toBe("/Users/me/repos/app"));
      window.removeEventListener(PROJECT_CHANGED_EVENT, heard);
      expect(heard).toHaveBeenCalled();
      // `~bob/...` cannot be expanded here, so it is dropped.
      expect(JSON.parse(localStorage.getItem("harness-kit-sync-recent-dirs")!)).toEqual([
        "/Users/me/repos/app",
        "/abs/other",
        "/Users/me",
      ]);
    });

    it("expands a `~` current project and keeps the key absolute", async () => {
      localStorage.setItem("harness-kit-current-project", "~/repos/app");
      await expandStoredTildes();
      expect(localStorage.getItem("harness-kit-current-project")).toBe("/Users/me/repos/app");
      expect(getCurrentProjectDir()).toBe("/Users/me/repos/app");
    });

    it("hides but keeps `~` entries when the home directory cannot be read", async () => {
      mockHomeDir.mockRejectedValue(new Error("no home"));
      localStorage.setItem("harness-kit-sync-recent-dirs", JSON.stringify(["~/repos/app", "/abs/other"]));
      localStorage.setItem("harness-kit-current-project", "~/repos/app");
      await expandStoredTildes();
      // Hidden for this session, never handed out literally...
      expect(getRecentProjectDirs()).toEqual(["/abs/other"]);
      expect(getCurrentProjectDir()).not.toBe("~/repos/app");
      // ...but still stored, so a later launch can expand them.
      expect(JSON.parse(localStorage.getItem("harness-kit-sync-recent-dirs")!)).toEqual([
        "~/repos/app",
        "/abs/other",
      ]);
      expect(localStorage.getItem("harness-kit-current-project")).toBe("~/repos/app");
    });

    it("keeps unexpanded `~` recents when a project is chosen before the home lookup returns", async () => {
      let resolveHome!: (home: string) => void;
      mockHomeDir.mockImplementation(() => new Promise((resolve) => (resolveHome = resolve)));
      localStorage.setItem("harness-kit-sync-recent-dirs", JSON.stringify(["~/repos/app"]));
      const expanding = expandStoredTildes();
      setCurrentProjectDir("/abs/new");
      expect(JSON.parse(localStorage.getItem("harness-kit-sync-recent-dirs")!)).toEqual([
        "/abs/new",
        "~/repos/app",
      ]);
      resolveHome("/Users/me");
      await expanding;
      expect(getRecentProjectDirs()).toEqual(["/abs/new", "/Users/me/repos/app"]);
    });

    it("stores and grants a `~` choice as the absolute path", async () => {
      setCurrentProjectDir("~/repos/picked");
      await waitFor(() => expect(getCurrentProjectDir()).toBe("/Users/me/repos/picked"));
      expect(getRecentProjectDirs()).toEqual(["/Users/me/repos/picked"]);
      expect(mockGrantProjectScope.mock.calls).toEqual([["/Users/me/repos/picked"]]);
    });

    it("leaves absolute paths alone without asking for the home directory", async () => {
      setCurrentProjectDir("/abs/app");
      await expandStoredTildes();
      expect(mockHomeDir).not.toHaveBeenCalled();
      expect(getCurrentProjectDir()).toBe("/abs/app");
    });
  });
});
