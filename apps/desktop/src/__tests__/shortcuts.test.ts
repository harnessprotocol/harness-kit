import { describe, it, expect } from "vitest";
import { NAV } from "../nav";
import { SHORTCUTS, toAccelerator } from "../shortcuts";

describe("SHORTCUTS", () => {
  it("holds one global entry per NAV shortcut with the NAV label", () => {
    const navEntries = NAV.filter((n) => n.shortcut !== undefined);
    const fromShortcuts = SHORTCUTS.filter((s) => s.id.startsWith("nav:"));
    expect(fromShortcuts.map((s) => [s.label, s.key, s.scope])).toEqual(
      navEntries.map((n) => [n.label, String(n.shortcut), "global"]),
    );
  });

  it("lists settings, palette, sidebar, history, and the page shortcuts", () => {
    const byId = Object.fromEntries(SHORTCUTS.map((s) => [s.id, toAccelerator(s)]));
    expect(byId).toMatchObject({
      settings: "CmdOrCtrl+,",
      "command-palette": "CmdOrCtrl+K",
      "toggle-sidebar": "CmdOrCtrl+\\",
      back: "CmdOrCtrl+[",
      forward: "CmdOrCtrl+]",
      save: "CmdOrCtrl+S",
      "start-comparison": "CmdOrCtrl+Enter",
    });
    expect(SHORTCUTS.find((s) => s.id === "save")?.scope).toBe("page");
  });

  it("has no duplicate accelerators or ids", () => {
    expect(new Set(SHORTCUTS.map(toAccelerator)).size).toBe(SHORTCUTS.length);
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
  });

  it("adds Shift to the accelerator", () => {
    expect(toAccelerator({ id: "x", label: "x", key: "p", meta: true, shift: true, scope: "global" })).toBe("CmdOrCtrl+Shift+P");
  });
});
