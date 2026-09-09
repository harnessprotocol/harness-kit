import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";
import { getLabs } from "../lib/preferences";
import { shortcutPaths, visibleNav } from "../nav";

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

      // ⌘\ — toggle sidebar
      if (e.key === "\\") {
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

      // ⌘1–⌘N — navigate to nav.ts sections, recomputed on every keydown so a
      // labs flag flipped mid-session is reflected without a re-render.
      const paths = shortcutPaths(visibleNav(getLabs()));
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= paths.length) {
        e.preventDefault();
        navigate(paths[num - 1]);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate, toggleSidebar]);
}
