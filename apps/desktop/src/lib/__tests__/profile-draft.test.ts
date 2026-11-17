import { beforeEach, describe, expect, it, vi } from "vitest";

const writeHarnessFile = vi.hoisted(() => vi.fn());
vi.mock("../tauri", () => ({ writeHarnessFile }));

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
    localStorage.setItem(KEY, JSON.stringify({ a: { buffer: 1 }, b: { buffer: "x", synced: "y" } }));
    const m = await load();
    expect(m.getProfileDraft("a")).toBeUndefined();
    expect(m.getProfileDraft("b")).toEqual({ buffer: "x", synced: "y" });
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

describe("saveAllDrafts", () => {
  beforeEach(() => {
    localStorage.clear();
    writeHarnessFile.mockReset();
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
