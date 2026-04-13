// apps/desktop/src/hooks/useSidebarResize.ts
import { useCallback, useEffect, useRef } from "react";
import { SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN, setSidebarWidth } from "../lib/preferences";

export function useSidebarResize() {
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const clamped = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, e.clientX));
      document.documentElement.style.setProperty("--sidebar-width", `${clamped}px`);
    }

    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const current = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"),
        10,
      );
      if (!isNaN(current)) setSidebarWidth(current);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return { onMouseDown };
}
