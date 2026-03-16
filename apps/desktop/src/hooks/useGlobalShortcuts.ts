import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";

const NAV_PATHS = [
  "/harness/plugins",
  "/marketplace",
  "/observatory",
  "/comparator",
  "/security/permissions",
] as const;

interface Options {
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  navigate: NavigateFunction;
}

export function useGlobalShortcuts({ setSettingsOpen, navigate }: Options) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Escape (with or without meta) closes preferences panel
      if (e.key === "Escape") {
        setSettingsOpen(false);
        return;
      }

      if (!e.metaKey) return;

      // ⌘, — toggle preferences
      if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen((o) => !o);
        return;
      }

      // ⌘1–⌘5 — navigate to sections
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 5) {
        e.preventDefault();
        navigate(NAV_PATHS[num - 1]);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setSettingsOpen, navigate]);
}
