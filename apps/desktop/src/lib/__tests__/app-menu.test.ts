import { describe, it, expect, vi, beforeEach } from "vitest";

type Node = { kind: string; text?: string; item?: unknown; accelerator?: string; action?: () => void; items?: Node[]; id?: string };

const { open, setAsAppMenu } = vi.hoisted(() => ({ open: vi.fn(), setAsAppMenu: vi.fn() }));

vi.mock("@tauri-apps/plugin-shell", () => ({ open }));
const { tauri, platform } = vi.hoisted(() => ({ tauri: vi.fn(() => true), platform: vi.fn(() => "darwin") }));
vi.mock("../tauri", () => ({ isTauriRuntimeAvailable: tauri }));
vi.mock("../../pages/machine/machine-data", () => ({ detectDesktopPlatform: platform }));
vi.mock("@tauri-apps/api/menu", () => ({
  MenuItem: { new: async (o: object) => ({ kind: "item", ...o }) },
  PredefinedMenuItem: { new: async (o: object) => ({ kind: "predefined", ...o }) },
  Submenu: { new: async (o: object) => ({ kind: "submenu", ...o }) },
  Menu: { new: async (o: object) => ({ kind: "menu", ...o, setAsAppMenu }) },
}));

import { buildAppMenu, installAppMenu, installAppMenuOnMac, resetAppMenuForTests, DOCS_URL } from "../app-menu";
import { SHORTCUTS, toAccelerator } from "../../shortcuts";

async function build() {
  const menu = (await buildAppMenu()) as unknown as Node;
  const sub = (name: string) => menu.items!.find((i) => i.text === name)!;
  return { menu, sub };
}

beforeEach(() => { vi.clearAllMocks(); tauri.mockReturnValue(true); platform.mockReturnValue("darwin"); resetAppMenuForTests(); });

describe("app menu", () => {
  it("has App, Edit, View, Help in order", async () => {
    const { menu } = await build();
    expect(menu.items!.map((i) => i.text)).toEqual(["Harness Kit", "Edit", "View", "Help"]);
  });

  it("App holds the predefined About, Hide, Hide others, Show all, Quit", async () => {
    const { sub } = await build();
    const items = sub("Harness Kit").items!.map((i) => i.item);
    expect(items.filter((i) => i !== "Separator").map((i) => (typeof i === "string" ? i : Object.keys(i as object)[0]))).toEqual(
      ["About", "Hide", "HideOthers", "ShowAll", "Quit"],
    );
  });

  it("Edit holds the predefined Undo, Redo, Cut, Copy, Paste, Select All", async () => {
    const { sub } = await build();
    const items = sub("Edit").items!;
    expect(items.every((i) => i.kind === "predefined")).toBe(true);
    expect(items.map((i) => i.item).filter((i) => i !== "Separator")).toEqual(
      ["Undo", "Redo", "Cut", "Copy", "Paste", "SelectAll"],
    );
  });

  it("View holds one item per SHORTCUTS entry with its accelerator, in order", async () => {
    const { sub } = await build();
    const items = sub("View").items!;
    expect(items.map((i) => [i.text, i.accelerator])).toEqual(SHORTCUTS.map((s) => [s.label, toAccelerator(s)]));
  });

  it("Help holds the docs link that opens the docs URL", async () => {
    const { sub } = await build();
    const items = sub("Help").items!;
    expect(items.map((i) => i.text)).toEqual(["Harness Kit docs"]);
    items[0].action!();
    expect(open).toHaveBeenCalledWith("https://harnesskit.ai/docs");
    expect(DOCS_URL).toBe("https://harnesskit.ai/docs");
  });

  it("a View click dispatches one keydown that reaches document and window listeners", async () => {
    const { sub } = await build();
    const onDoc = vi.fn();
    const onWin = vi.fn();
    document.addEventListener("keydown", onDoc);
    window.addEventListener("keydown", onWin);
    try {
      const item = sub("View").items!.find((i) => i.text === "Settings")!;
      item.action!();
      expect(onDoc).toHaveBeenCalledTimes(1);
      expect(onWin).toHaveBeenCalledTimes(1);
      const e = onDoc.mock.calls[0][0] as KeyboardEvent;
      expect([e.key, e.metaKey, e.shiftKey]).toEqual([",", true, false]);
    } finally {
      document.removeEventListener("keydown", onDoc);
      window.removeEventListener("keydown", onWin);
    }
  });

  it("installAppMenu sets the built menu as the app menu", async () => {
    await installAppMenu();
    expect(setAsAppMenu).toHaveBeenCalledTimes(1);
  });

  it("redispatches on the focused element, reaching it and window exactly once", async () => {
    const { sub } = await build();
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();
    const onEl = vi.fn();
    const onDoc = vi.fn();
    const onWin = vi.fn();
    input.addEventListener("keydown", onEl);
    document.addEventListener("keydown", onDoc);
    window.addEventListener("keydown", onWin);
    try {
      sub("View").items!.find((i) => i.text === "Save")!.action!();
      expect(onEl).toHaveBeenCalledTimes(1);
      expect(onDoc).toHaveBeenCalledTimes(1);
      expect(onWin).toHaveBeenCalledTimes(1);
      expect((onEl.mock.calls[0][0] as KeyboardEvent).key).toBe("s");
    } finally {
      input.remove();
      document.removeEventListener("keydown", onDoc);
      window.removeEventListener("keydown", onWin);
    }
  });

  it("falls back to document when the body is focused", async () => {
    const { sub } = await build();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    const onDoc = vi.fn();
    const onWin = vi.fn();
    document.addEventListener("keydown", onDoc);
    window.addEventListener("keydown", onWin);
    try {
      sub("View").items!.find((i) => i.text === "Save")!.action!();
      expect(onDoc).toHaveBeenCalledTimes(1);
      expect(onWin).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", onDoc);
      window.removeEventListener("keydown", onWin);
    }
  });

  it("builds the menu once when installAppMenu is called twice", async () => {
    await Promise.all([installAppMenu(), installAppMenu()]);
    await installAppMenu();
    expect(setAsAppMenu).toHaveBeenCalledTimes(1);
  });

  it("resets after a failed install so a later call retries", async () => {
    setAsAppMenu.mockRejectedValueOnce(new Error("boom"));
    await expect(installAppMenu()).rejects.toThrow("boom");
    await installAppMenu();
    expect(setAsAppMenu).toHaveBeenCalledTimes(2);
  });

  it("installs on macOS in the desktop runtime", async () => {
    await installAppMenuOnMac();
    expect(setAsAppMenu).toHaveBeenCalledTimes(1);
  });

  it("does not install on non-macOS or outside Tauri", async () => {
    platform.mockReturnValue("win32");
    await installAppMenuOnMac();
    platform.mockReturnValue("linux");
    await installAppMenuOnMac();
    platform.mockReturnValue("darwin");
    tauri.mockReturnValue(false);
    await installAppMenuOnMac();
    expect(setAsAppMenu).not.toHaveBeenCalled();
  });
});
