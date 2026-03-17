import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";

export const NAV_PATHS = [
  "/harness/plugins",
  "/marketplace",
  "/observatory",
  "/comparator",
  "/security/permissions",
  "/board",
] as const;

interface Options {
  navigate: NavigateFunction;
  toggleSidebar?: () => void;
}

export function useGlobalShortcuts({ navigate, toggleSidebar }: Options) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey) return;

      // ⌘, — open preferences
      if (e.key === ",") {
        e.preventDefault();
        navigate("/preferences");
        return;
      }

      // ⌘\ or ⌘B — toggle sidebar
      if (e.key === "\\" || e.key === "b") {
        e.preventDefault();
        toggleSidebar?.();
        return;
      }

      // ⌘[ — navigate back
      if (e.key === "[") {
        e.preventDefault();
        navigate(-1);
        return;
      }

      // ⌘] — navigate forward
      if (e.key === "]") {
        e.preventDefault();
        navigate(1);
        return;
      }

      // ⌘1–⌘6 — navigate to sections
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= NAV_PATHS.length) {
        e.preventDefault();
        navigate(NAV_PATHS[num - 1]);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate, toggleSidebar]);
}
