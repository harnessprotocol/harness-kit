import { useState, useCallback, useEffect } from "react";

interface UseArrowNavigationOptions {
  count: number;
  onActivate?: (index: number) => void;
}

export function useArrowNavigation({ count, onActivate }: UseArrowNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Reset when list changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [count]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (count === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => (i < count - 1 ? i + 1 : i));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => (i > 0 ? i - 1 : 0));
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(count - 1);
        break;
      case "Enter":
        if (focusedIndex >= 0 && onActivate) {
          e.preventDefault();
          onActivate(focusedIndex);
        }
        break;
    }
  }, [count, focusedIndex, onActivate]);

  return { focusedIndex, onKeyDown, setFocusedIndex };
}
