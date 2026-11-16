import { NAV, SETTINGS, type LabsFlags, type LabsKey } from "./nav";

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
  /** Listed only while the matching labs flag is on. */
  labs?: LabsKey;
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
  { id: "start-comparison", label: "Start comparison (Comparator)", key: "Enter", meta: true, scope: "page", labs: "comparator" },
];

/** The shortcuts to list now: labs shortcuts appear only while their flag is on. */
export function visibleShortcuts(labs: LabsFlags): Shortcut[] {
  return SHORTCUTS.filter((s) => s.labs === undefined || labs[s.labs]);
}

/** Tauri accelerator string, e.g. "CmdOrCtrl+Shift+K". */
export function toAccelerator(s: Shortcut): string {
  const key = s.key.length === 1 ? s.key.toUpperCase() : s.key;
  return ["CmdOrCtrl", ...(s.shift ? ["Shift"] : []), key].join("+");
}

const DOM_KEYS: Record<string, { code: string; keyCode: number }> = {
  ",": { code: "Comma", keyCode: 188 },
  "\\": { code: "Backslash", keyCode: 220 },
  "[": { code: "BracketLeft", keyCode: 219 },
  "]": { code: "BracketRight", keyCode: 221 },
  Enter: { code: "Enter", keyCode: 13 },
};

/**
 * The DOM `code` and legacy `keyCode` for a shortcut's key. Monaco resolves
 * keys from `keyCode`, never `key`, so a synthetic keydown needs both.
 */
export function domKey(s: Shortcut): { code: string; keyCode: number } {
  if (/^[0-9]$/.test(s.key)) return { code: `Digit${s.key}`, keyCode: 48 + Number(s.key) };
  if (/^[a-z]$/i.test(s.key)) return { code: `Key${s.key.toUpperCase()}`, keyCode: s.key.toUpperCase().charCodeAt(0) };
  const hit = DOM_KEYS[s.key];
  if (!hit) throw new Error(`No DOM key mapping for shortcut key "${s.key}"`);
  return hit;
}

export function matchesShortcut(s: Shortcut, e: KeyboardEvent): boolean {
  return (
    e.metaKey &&
    !!s.shift === e.shiftKey &&
    e.key.toLowerCase() === s.key.toLowerCase()
  );
}
