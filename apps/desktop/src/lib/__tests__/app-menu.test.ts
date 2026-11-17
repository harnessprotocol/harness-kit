import { describe, it, expect, vi, beforeEach } from "vitest";

type Node = { kind: string; text?: string; item?: unknown; accelerator?: string; action?: () => void; items?: Node[]; id?: string };

const { open, setAsAppMenu } = vi.hoisted(() => ({ open: vi.fn(), setAsAppMenu: vi.fn() }));

vi.mock("@tauri-apps/plugin-shell", () => ({ open }));
const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ emit }));
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
import { SHORTCUTS, toAccelerator, visibleShortcuts } from "../../shortcuts";
// @ts-expect-error monaco ships no types for its internal ESM modules
import { StandardKeyboardEvent } from "../../../node_modules/monaco-editor/esm/vs/base/browser/keyboardEvent.js";

async function build() {
  const menu = (await buildAppMenu()) as unknown as Node;
  const sub = (name: string) => menu.items!.find((i) => i.text === name)!;
  return { menu, sub };
}

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); tauri.mockReturnValue(true); platform.mockReturnValue("darwin"); resetAppMenuForTests(); });

describe("app menu", () => {
  it("has App, Edit, View, Window, Help in order", async () => {
    const { menu } = await build();
    expect(menu.items!.map((i) => i.text)).toEqual(["Harness Kit", "Edit", "View", "Window", "Help"]);
  });

  it("Window holds the predefined Minimize, Maximize, Fullscreen, then Close window", async () => {
    const { sub } = await build();
    const items = sub("Window").items!;
    expect(items.every((i) => i.kind === "predefined")).toBe(true);
    expect(items.map((i) => i.item)).toEqual(["Minimize", "Maximize", "Fullscreen", "Separator", "CloseWindow"]);
  });

  it("App holds the predefined About, Hide, Hide others, Show all, then a custom Quit", async () => {
    const { sub } = await build();
    const items = sub("Harness Kit").items!;
    const predefined = items.filter((i) => i.kind === "predefined").map((i) => i.item);
    expect(predefined.filter((i) => i !== "Separator").map((i) => (typeof i === "string" ? i : Object.keys(i as object)[0]))).toEqual(
      ["About", "Hide", "HideOthers", "ShowAll"],
    );
    const quit = items[items.length - 1];
    expect(quit.kind).toBe("item");
    expect(quit.text).toBe("Quit Harness Kit");
    expect(quit.accelerator).toBe("CmdOrCtrl+Q");
  });

  it("Quit asks the webview instead of exiting", async () => {
    const { sub } = await build();
    const items = sub("Harness Kit").items!;
    items[items.length - 1].action!();
    expect(emit).toHaveBeenCalledWith("app://quit-requested");
  });

  it("Edit holds the predefined Undo, Redo, Cut, Copy, Paste, Select All", async () => {
    const { sub } = await build();
    const items = sub("Edit").items!;
    expect(items.every((i) => i.kind === "predefined")).toBe(true);
    expect(items.map((i) => i.item).filter((i) => i !== "Separator")).toEqual(
      ["Undo", "Redo", "Cut", "Copy", "Paste", "SelectAll"],
    );
  });

  it("View holds one item per visible shortcut with its accelerator, in order", async () => {
    const { sub } = await build();
    const items = sub("View").items!;
    expect(items.map((i) => [i.text, i.accelerator])).toEqual(
      visibleShortcuts({ comparator: false }).map((s) => [s.label, toAccelerator(s)]),
    );
  });

  it("View omits the Comparator shortcut while the comparator lab is off", async () => {
    const { sub } = await build();
    expect(sub("View").items!.map((i) => i.text)).not.toContain("Start comparison (Comparator)");
  });

  it("View lists the Comparator shortcut while the comparator lab is on", async () => {
    localStorage.setItem("harness-kit-labs-comparator", "true");
    const { sub } = await build();
    expect(sub("View").items!.map((i) => i.text)).toEqual(SHORTCUTS.map((s) => s.label));
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

  it("carries code and keyCode that Monaco resolves to the same chord as CtrlCmd+KeyS", async () => {
    // Mounting Monaco in jsdom is not practical, so this runs the dispatched
    // event through Monaco's own StandardKeyboardEvent key resolution.
    const { sub } = await build();
    let seen: KeyboardEvent | undefined;
    const grab = (e: Event) => { seen = e as KeyboardEvent; };
    document.addEventListener("keydown", grab);
    try {
      sub("View").items!.find((i) => i.text === "Save")!.action!();
    } finally {
      document.removeEventListener("keydown", grab);
    }
    expect(seen).toBeDefined();
    expect([seen!.code, seen!.keyCode, seen!.which]).toEqual(["KeyS", 83, 83]);
    const std = new StandardKeyboardEvent(seen!);
    const chord = std.toKeyCodeChord();
    // Monaco: KeyCode.KeyS is 49; the chord must be meta (CtrlCmd on macOS) + S.
    expect(chord.keyCode).toBe(49);
    expect(chord.metaKey).toBe(true);
    expect(chord.ctrlKey).toBe(false);
    expect(chord.shiftKey).toBe(false);
    expect(chord.altKey).toBe(false);
  });
});
