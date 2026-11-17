import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { open } from "@tauri-apps/plugin-shell";
import { emit } from "@tauri-apps/api/event";
import { isTauriRuntimeAvailable } from "./tauri";
import { detectDesktopPlatform } from "../pages/machine/machine-data";
import { visibleShortcuts, domKey, toAccelerator, type Shortcut } from "../shortcuts";
import { getLabs } from "./preferences";

export const QUIT_REQUESTED_EVENT = "app://quit-requested";
export const DOCS_URL = "https://harnesskit.ai/docs";

/**
 * A native accelerator consumes the key before the webview sees it, so a menu
 * click re-dispatches it as a keydown on the focused element (an editor, say),
 * falling back to `document` when focus is on the body. It bubbles through
 * document to window, so each listener sees it once.
 */
function redispatch(s: Shortcut) {
  const active = document.activeElement;
  const target: EventTarget = active && active !== document.body ? active : document;
  const { code, keyCode } = domKey(s);
  const event = new KeyboardEvent("keydown", {
    key: s.key, code, metaKey: true, shiftKey: !!s.shift, bubbles: true, cancelable: true,
  });
  // The constructor leaves keyCode and which at 0 in Chromium and WebKit.
  Object.defineProperty(event, "keyCode", { get: () => keyCode });
  Object.defineProperty(event, "which", { get: () => keyCode });
  target.dispatchEvent(event);
}

export async function buildAppMenu(): Promise<Menu> {
  const predefined = (item: NonNullable<Parameters<typeof PredefinedMenuItem.new>[0]>["item"]) =>
    PredefinedMenuItem.new({ item });

  const appMenu = await Submenu.new({
    text: "Harness Kit",
    items: [
      await predefined({ About: null }),
      await predefined("Separator"),
      await predefined("Hide"),
      await predefined("HideOthers"),
      await predefined("ShowAll"),
      await predefined("Separator"),
      // Not the predefined Quit: that exits at once. This one asks the webview,
      // which prompts when drafts are unsaved (the same path as a window close).
      await MenuItem.new({
        id: "app:quit",
        text: "Quit Harness Kit",
        accelerator: "CmdOrCtrl+Q",
        action: () => { void emit(QUIT_REQUESTED_EVENT); },
      }),
    ],
  });

  const editMenu = await Submenu.new({
    text: "Edit",
    items: [
      await predefined("Undo"),
      await predefined("Redo"),
      await predefined("Separator"),
      await predefined("Cut"),
      await predefined("Copy"),
      await predefined("Paste"),
      await predefined("SelectAll"),
    ],
  });

  const viewItems = [];
  for (const s of visibleShortcuts(getLabs())) {
    viewItems.push(
      await MenuItem.new({ id: `shortcut:${s.id}`, text: s.label, accelerator: toAccelerator(s), action: () => redispatch(s) }),
    );
  }
  const viewMenu = await Submenu.new({ text: "View", items: viewItems });

  const windowMenu = await Submenu.new({
    text: "Window",
    items: [
      await predefined("Minimize"),
      await predefined("Maximize"),
      await predefined("Fullscreen"),
      await predefined("Separator"),
      await predefined("CloseWindow"),
    ],
  });

  const helpMenu = await Submenu.new({
    text: "Help",
    items: [
      await MenuItem.new({ id: "help:docs", text: "Harness Kit docs", action: () => { void open(DOCS_URL); } }),
    ],
  });

  return Menu.new({ items: [appMenu, editMenu, viewMenu, windowMenu, helpMenu] });
}

let installing: Promise<void> | null = null;

/** Installs the menu once; a failed install resets so a later call retries. */
export function installAppMenu(): Promise<void> {
  if (!installing) {
    installing = (async () => {
      const menu = await buildAppMenu();
      await menu.setAsAppMenu();
    })().catch((err) => {
      installing = null;
      throw err;
    });
  }
  return installing;
}

/** AC-40 is macOS-only: skip other platforms and the browser preview. */
export function installAppMenuOnMac(): Promise<void> {
  if (!isTauriRuntimeAvailable() || detectDesktopPlatform() !== "darwin") return Promise.resolve();
  return installAppMenu();
}

/** Test seam: forget the cached install. */
export function resetAppMenuForTests(): void {
  installing = null;
}
