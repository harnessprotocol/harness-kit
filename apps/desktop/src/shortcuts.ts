import { NAV, SETTINGS } from "./nav";

export interface Shortcut {
  id: string;
  label: string;
  /** The `KeyboardEvent.key` value, e.g. "1", ",", "k", "Enter". */
  key: string;
  meta: true;
  shift?: boolean;
  /**
   * "global" shortcuts are handled by `useGlobalShortcuts` on every page.
   * "page" shortcuts are bound by one page (its name is in the label); they
   * are listed here so the menu bar shows them, but the page owns the handler.
   */
  scope: "global" | "page";
}

/** The one shortcut list. The menu bar and `useGlobalShortcuts` both read it. */
export const SHORTCUTS: readonly Shortcut[] = [
  ...NAV.filter((entry) => entry.shortcut !== undefined).map(
    (entry): Shortcut => ({
      id: `nav:${entry.id}`,
      label: entry.label,
      key: String(entry.shortcut),
      meta: true,
      scope: "global",
    }),
  ),
  { id: "settings", label: SETTINGS.label, key: ",", meta: true, scope: "global" },
  { id: "command-palette", label: "Command palette", key: "k", meta: true, scope: "global" },
  { id: "toggle-sidebar", label: "Toggle sidebar", key: "\\", meta: true, scope: "global" },
  { id: "back", label: "Back", key: "[", meta: true, scope: "global" },
  { id: "forward", label: "Forward", key: "]", meta: true, scope: "global" },
  { id: "save", label: "Save", key: "s", meta: true, scope: "page" },
  { id: "start-comparison", label: "Start comparison (Comparator)", key: "Enter", meta: true, scope: "page" },
];

/** Tauri accelerator string, e.g. "CmdOrCtrl+Shift+K". */
export function toAccelerator(s: Shortcut): string {
  const key = s.key.length === 1 ? s.key.toUpperCase() : s.key;
  return ["CmdOrCtrl", ...(s.shift ? ["Shift"] : []), key].join("+");
}

export function matchesShortcut(s: Shortcut, e: KeyboardEvent): boolean {
  return (
    e.metaKey &&
    !!s.shift === e.shiftKey &&
    e.key.toLowerCase() === s.key.toLowerCase()
  );
}
