import { beforeEach, describe, expect, it, vi } from "vitest";

const writeHarnessFile = vi.hoisted(() => vi.fn());
const setUnsavedDrafts = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const readHarnessFile = vi.hoisted(() => vi.fn());
vi.mock("../tauri", () => ({ writeHarnessFile, setUnsavedDrafts, readHarnessFile }));

const KEY = "harness-kit:drafts:v1";
const PATH = "~/.harness/harness.yaml";

async function load() {
  vi.resetModules();
  return import("../profile-draft");
}

describe("draft persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    writeHarnessFile.mockReset();
  });

  it("writes a draft to storage on edit and removes it on clear", async () => {
    const m = await load();
    m.setProfileDraft(PATH, { buffer: "b", synced: "s" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ [PATH]: { buffer: "b", synced: "s" } });
    expect(m.hasUnsavedDrafts()).toBe(true);
    m.clearProfileDraft(PATH);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({});
    expect(m.hasUnsavedDrafts()).toBe(false);
  });

  it("restores drafts from storage on load", async () => {
    localStorage.setItem(KEY, JSON.stringify({ [PATH]: { buffer: "b", synced: "s" } }));
    const m = await load();
    expect(m.getProfileDraft(PATH)).toEqual({ buffer: "b", synced: "s" });
    expect(m.hasUnsavedDrafts()).toBe(true);
  });

  it("ignores malformed stored data", async () => {
    localStorage.setItem(KEY, "{not json");
    expect((await load()).hasUnsavedDrafts()).toBe(false);
    localStorage.setItem(KEY, JSON.stringify({ "~/.claude/harness.yaml": { buffer: 1 }, [PATH]: { buffer: "x", synced: "y" } }));
    const m = await load();
    expect(m.unsavedDraftPaths()).toEqual([PATH]);
    expect(m.getProfileDraft(PATH)).toEqual({ buffer: "x", synced: "y" });
  });

  it("keeps editing working when storage throws", async () => {
    const m = await load();
    const throwing = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("quota"); },
    };
    vi.stubGlobal("localStorage", throwing);
    expect(() => m.setProfileDraft(PATH, { buffer: "b", synced: "s" })).not.toThrow();
    expect(m.getProfileDraft(PATH)).toEqual({ buffer: "b", synced: "s" });
    expect((await load()).hasUnsavedDrafts()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("Rust unsaved flag", () => {
  beforeEach(() => {
    localStorage.clear();
    setUnsavedDrafts.mockClear();
  });

  it("is told at load and on every flip", async () => {
    const m = await load();
    expect(setUnsavedDrafts).toHaveBeenLastCalledWith(false);
    m.setProfileDraft(PATH, { buffer: "b", synced: "s" });
    expect(setUnsavedDrafts).toHaveBeenLastCalledWith(true);
    const calls = setUnsavedDrafts.mock.calls.length;
    m.setProfileDraft(PATH, { buffer: "c", synced: "s" });
    expect(setUnsavedDrafts).toHaveBeenCalledTimes(calls);
    m.clearProfileDraft(PATH);
    expect(setUnsavedDrafts).toHaveBeenLastCalledWith(false);
  });

  it("is true at load when drafts were restored", async () => {
    localStorage.setItem(KEY, JSON.stringify({ [PATH]: { buffer: "b", synced: "s" } }));
    await load();
    expect(setUnsavedDrafts).toHaveBeenLastCalledWith(true);
  });
});

describe("stale drafts at load", () => {
  beforeEach(() => localStorage.clear());

  it("drops a draft under a key the editor cannot write", async () => {
    localStorage.setItem(KEY, JSON.stringify({ "/repo/harness.yaml": { buffer: "b", synced: "s" } }));
    expect((await load()).hasUnsavedDrafts()).toBe(false);
  });

  it("moves a legacy-path draft to the personal key", async () => {
    localStorage.setItem(KEY, JSON.stringify({ "~/.claude/harness.yaml": { buffer: "b", synced: "s" } }));
    const m = await load();
    expect(m.unsavedDraftPaths()).toEqual([PATH]);
    expect(m.getProfileDraft(PATH)).toEqual({ buffer: "b", synced: "s" });
  });

  it("keeps the personal draft when both exist", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        "~/.claude/harness.yaml": { buffer: "old", synced: "s" },
        [PATH]: { buffer: "new", synced: "s" },
      }),
    );
    const m = await load();
    expect(m.unsavedDraftPaths()).toEqual([PATH]);
    expect(m.getProfileDraft(PATH)?.buffer).toBe("new");
  });
});

describe("saveAllDrafts", () => {
  beforeEach(() => {
    localStorage.clear();
    writeHarnessFile.mockReset();
    readHarnessFile.mockReset();
    readHarnessFile.mockResolvedValue({ found: true, content: "old", path: "~/.harness/harness.yaml" });
  });

  it("saves a moved legacy-key draft with no digest when the legacy file is unchanged", async () => {
    writeHarnessFile.mockResolvedValue("x");
    readHarnessFile.mockResolvedValue({
      found: true, content: "legacy", path: "~/.claude/harness.yaml", legacy_claude_file: true,
    });
    localStorage.setItem(KEY, JSON.stringify({ "~/.claude/harness.yaml": { buffer: "new", synced: "legacy" } }));
    const m = await load();
    const result = await m.saveAllDrafts();
    expect(result).toEqual({ saved: [PATH], failed: [] });
    expect(writeHarnessFile).toHaveBeenCalledWith("new", undefined);
  });

  it("refuses a moved legacy-key draft when the legacy file changed", async () => {
    readHarnessFile.mockResolvedValue({
      found: true, content: "edited elsewhere", path: "~/.claude/harness.yaml", legacy_claude_file: true,
    });
    localStorage.setItem(KEY, JSON.stringify({ "~/.claude/harness.yaml": { buffer: "new", synced: "legacy" } }));
    const m = await load();
    const result = await m.saveAllDrafts();
    expect(result.saved).toEqual([]);
    expect(result.failed[0].path).toBe(PATH);
    expect(result.failed[0].reason).toContain("changed since this draft was made");
    expect(writeHarnessFile).not.toHaveBeenCalled();
    expect(m.getProfileDraft(PATH)).toBeDefined();
  });

  it("saves every draft through the write path and clears the saved ones", async () => {
    writeHarnessFile.mockResolvedValue("/home/u/.harness/harness.yaml");
    const m = await load();
    m.setProfileDraft(PATH, { buffer: "new", synced: "old" });
    const result = await m.saveAllDrafts();
    expect(result).toEqual({ saved: [PATH], failed: [] });
    expect(writeHarnessFile).toHaveBeenCalledTimes(1);
    expect(writeHarnessFile.mock.calls[0][0]).toBe("new");
    expect(typeof writeHarnessFile.mock.calls[0][1]).toBe("string");
    expect(m.hasUnsavedDrafts()).toBe(false);
  });

  it("sends no digest for a legacy-path draft", async () => {
    writeHarnessFile.mockResolvedValue("x");
    const m = await load();
    m.setProfileDraft("~/.claude/harness.yaml", { buffer: "new", synced: "old" });
    await m.saveAllDrafts();
    expect(writeHarnessFile).toHaveBeenCalledWith("new", undefined);
  });

  it("keeps a failed draft and reports the reason", async () => {
    writeHarnessFile.mockRejectedValue("file changed on disk");
    const m = await load();
    m.setProfileDraft(PATH, { buffer: "new", synced: "old" });
    const result = await m.saveAllDrafts();
    expect(result).toEqual({ saved: [], failed: [{ path: PATH, reason: "file changed on disk" }] });
    expect(m.getProfileDraft(PATH)).toBeDefined();
    expect(m.hasUnsavedDrafts()).toBe(true);
  });
});
