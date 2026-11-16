import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { open } from "@tauri-apps/plugin-shell";
import { SHORTCUTS, toAccelerator, type Shortcut } from "../shortcuts";

export const DOCS_URL = "https://harnesskit.ai/docs";

/**
 * A native accelerator consumes the key before the webview sees it, so a menu
 * click re-dispatches it as a keydown on `document` (bubbling to `window`).
 * Document and window listeners both run, and each shortcut has one handler.
 */
function redispatch(s: Shortcut) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: s.key, metaKey: true, shiftKey: !!s.shift, bubbles: true, cancelable: true }),
  );
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
      await predefined("Quit"),
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
  for (const s of SHORTCUTS) {
    viewItems.push(
      await MenuItem.new({ id: `shortcut:${s.id}`, text: s.label, accelerator: toAccelerator(s), action: () => redispatch(s) }),
    );
  }
  const viewMenu = await Submenu.new({ text: "View", items: viewItems });

  const helpMenu = await Submenu.new({
    text: "Help",
    items: [
      await MenuItem.new({ id: "help:docs", text: "Harness Kit docs", action: () => { void open(DOCS_URL); } }),
    ],
  });

  return Menu.new({ items: [appMenu, editMenu, viewMenu, helpMenu] });
}

export async function installAppMenu(): Promise<void> {
  const menu = await buildAppMenu();
  await menu.setAsAppMenu();
}
