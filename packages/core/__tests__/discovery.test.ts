import { describe, it, expect } from "vitest";
import { findSkillFiles, computeSourceDir } from "../src/compile/discovery.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

describe("findSkillFiles", () => {
  it("finds SKILL.md in a flat directory", async () => {
    const fs = new MockFsProvider({
      "/plugin/SKILL.md": "# Skill",
    });
    const found = await findSkillFiles("/plugin", fs);
    expect(found).toEqual(["/plugin/SKILL.md"]);
  });

  it("finds SKILL.md in nested subdirectory", async () => {
    const fs = new MockFsProvider({
      "/plugin/skills/explain/SKILL.md": "# Explain",
    });
    const found = await findSkillFiles("/plugin", fs);
    expect(found).toEqual(["/plugin/skills/explain/SKILL.md"]);
  });

  it("finds multiple SKILL.md files across subdirectories", async () => {
    const fs = new MockFsProvider({
      "/plugin/skills/explain/SKILL.md": "# Explain",
      "/plugin/skills/refactor/SKILL.md": "# Refactor",
    });
    const found = await findSkillFiles("/plugin", fs);
    expect(found).toHaveLength(2);
  });

  it("returns empty array when no SKILL.md exists", async () => {
    const fs = new MockFsProvider({
      "/plugin/README.md": "# Readme",
    });
    const found = await findSkillFiles("/plugin", fs);
    expect(found).toHaveLength(0);
  });

  it("returns empty array for non-existent directory", async () => {
    const fs = new MockFsProvider({});
    const found = await findSkillFiles("/nonexistent", fs);
    expect(found).toHaveLength(0);
  });

  it("respects maxDepth limit", async () => {
    const fs = new MockFsProvider({
      "/plugin/a/b/c/d/e/SKILL.md": "# Deep",
    });
    const found = await findSkillFiles("/plugin", fs, 2);
    expect(found).toHaveLength(0);
  });
});

describe("computeSourceDir", () => {
  const join = (...segs: string[]) => segs.join("/").replace(/\/+/g, "/");

  it("resolves relative local source (strips leading ./)", () => {
    const dir = computeSourceDir("./plugins/my-plugin", "/project", "/home/user", join);
    expect(dir).toBe("/project/plugins/my-plugin");
  });

  it("resolves parent-relative local source", () => {
    const dir = computeSourceDir("../shared-plugin", "/project", "/home/user", join);
    // ../ prefix is passed through to joinPath as-is
    expect(dir).toBe("/project/../shared-plugin");
  });

  it("passes through absolute source unchanged", () => {
    const dir = computeSourceDir("/absolute/path", "/project", "/home/user", join);
    expect(dir).toBe("/absolute/path");
  });

  it("maps owner/repo to harness cache", () => {
    const dir = computeSourceDir("owner/repo", "/project", "/home/user", join);
    expect(dir).toBe("/home/user/.harness/cache/owner/repo");
  });

  it("strips github.com/ prefix before building cache path", () => {
    const dir = computeSourceDir("github.com/owner/repo", "/project", "/home/user", join);
    expect(dir).toBe("/home/user/.harness/cache/owner/repo");
  });

  it("returns null for empty source", () => {
    const dir = computeSourceDir("", "/project", "/home/user", join);
    expect(dir).toBeNull();
  });
});
