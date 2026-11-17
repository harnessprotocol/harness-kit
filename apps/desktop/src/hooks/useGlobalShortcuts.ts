import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";
import { NAV, SETTINGS } from "../nav";
import { SHORTCUTS, matchesShortcut } from "../shortcuts";

interface Options {
  navigate: NavigateFunction;
  toggleSidebar?: () => void;
  togglePalette?: () => void;
}

/** Handles exactly the `scope: "global"` entries of SHORTCUTS. */
export function useGlobalShortcuts({ navigate, toggleSidebar, togglePalette }: Options) {
  useEffect(() => {
    function run(id: string): boolean {
      if (id.startsWith("nav:")) {
        const entry = NAV.find((n) => `nav:${n.id}` === id);
        if (!entry) return false;
        navigate(entry.path);
        return true;
      }
      switch (id) {
        case "settings": navigate(SETTINGS.path); return true;
        case "command-palette": togglePalette?.(); return true;
        case "toggle-sidebar": toggleSidebar?.(); return true;
        case "back": navigate(-1); return true;
        case "forward": navigate(1); return true;
        default: return false;
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey) return;
      for (const s of SHORTCUTS) {
        if (s.scope !== "global" || !matchesShortcut(s, e)) continue;
        if (run(s.id)) e.preventDefault();
        return;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate, toggleSidebar, togglePalette]);
}
