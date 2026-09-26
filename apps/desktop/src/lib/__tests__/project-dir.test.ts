import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PROJECT_CHANGED_EVENT,
  getCurrentProjectDir,
  getRecentProjectDirs,
  setCurrentProjectDir,
} from "../project-dir";

const mockGrantProjectScope = vi.fn();
vi.mock("../tauri", () => ({
  grantProjectScope: (...args: unknown[]) => mockGrantProjectScope(...args),
}));

describe("project-dir store (AC-17)", () => {
  beforeEach(() => {
    mockGrantProjectScope.mockReset();
    mockGrantProjectScope.mockResolvedValue(undefined);
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
});
