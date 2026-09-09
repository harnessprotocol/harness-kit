import { describe, it, expect } from "vitest";
import { NAV, SETTINGS, visibleNav, shortcutPaths } from "../nav";

describe("nav declaration", () => {
  it("has the five destinations in order, Settings pinned separately", () => {
    expect(NAV.filter((e) => !e.labs).map((e) => e.label)).toEqual(["Machine", "Profile", "Claude Code", "Marketplace"]);
    expect(SETTINGS.path).toBe("/preferences");
  });
  it("numbers shortcuts 1..4 in sidebar order and never numbers a labs entry", () => {
    expect(shortcutPaths(visibleNav({ comparator: true }))).toEqual(["/machine", "/harness/file", "/harness/claude-md", "/marketplace"]);
    expect(NAV.find((e) => e.labs === "comparator")?.shortcut).toBeUndefined();
  });
  it("hides labs entries until enabled", () => {
    expect(visibleNav({ comparator: false }).some((e) => e.id === "comparator")).toBe(false);
    expect(visibleNav({ comparator: true }).some((e) => e.id === "comparator")).toBe(true);
  });
  it("Profile and Claude Code list their children in order", () => {
    const profile = NAV.find((e) => e.id === "profile");
    const claudeCode = NAV.find((e) => e.id === "claude-code");
    expect(profile?.children?.map((c) => c.path)).toEqual(["/harness/file", "/harness/sync"]);
    expect(claudeCode?.children?.map((c) => c.path)).toEqual([
      "/harness/claude-md", "/harness/mcp", "/harness/plugins", "/harness/hooks", "/harness/permissions", "/observatory",
    ]);
  });
});
