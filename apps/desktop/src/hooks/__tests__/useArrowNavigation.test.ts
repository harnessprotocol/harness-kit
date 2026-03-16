import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useArrowNavigation } from "../useArrowNavigation";

// ── Helpers ───────────────────────────────────────────────────

function reactKey(key: string): React.KeyboardEvent {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

function hook(count: number, onActivate?: (i: number) => void) {
  return renderHook(
    ({ c, fn }: { c: number; fn?: (i: number) => void }) =>
      useArrowNavigation({ count: c, onActivate: fn }),
    { initialProps: { c: count, fn: onActivate } },
  );
}

// ── Tests ─────────────────────────────────────────────────────

describe("ArrowDown", () => {
  it("increments focusedIndex from -1 to 0", () => {
    const { result } = hook(3);
    act(() => result.current.onKeyDown(reactKey("ArrowDown")));
    expect(result.current.focusedIndex).toBe(0);
  });

  it("increments up to count-1 and does not exceed it", () => {
    const { result } = hook(3);
    act(() => result.current.onKeyDown(reactKey("ArrowDown")));
    act(() => result.current.onKeyDown(reactKey("ArrowDown")));
    act(() => result.current.onKeyDown(reactKey("ArrowDown")));
    act(() => result.current.onKeyDown(reactKey("ArrowDown"))); // extra press
    expect(result.current.focusedIndex).toBe(2);
  });
});

describe("ArrowUp", () => {
  it("does not go below 0", () => {
    const { result } = hook(3);
    act(() => result.current.onKeyDown(reactKey("ArrowUp")));
    expect(result.current.focusedIndex).toBe(0);
  });

  it("decrements from a positive index", () => {
    const { result } = hook(3);
    act(() => result.current.onKeyDown(reactKey("ArrowDown")));
    act(() => result.current.onKeyDown(reactKey("ArrowDown")));
    act(() => result.current.onKeyDown(reactKey("ArrowUp")));
    expect(result.current.focusedIndex).toBe(0);
  });
});

describe("Home / End", () => {
  it("Home goes to index 0", () => {
    const { result } = hook(5);
    act(() => result.current.onKeyDown(reactKey("ArrowDown")));
    act(() => result.current.onKeyDown(reactKey("ArrowDown")));
    act(() => result.current.onKeyDown(reactKey("Home")));
    expect(result.current.focusedIndex).toBe(0);
  });

  it("End goes to count-1", () => {
    const { result } = hook(5);
    act(() => result.current.onKeyDown(reactKey("End")));
    expect(result.current.focusedIndex).toBe(4);
  });
});

describe("Enter", () => {
  it("calls onActivate with current focusedIndex", () => {
    const onActivate = vi.fn();
    const { result } = hook(3, onActivate);
    act(() => result.current.onKeyDown(reactKey("ArrowDown")));
    act(() => result.current.onKeyDown(reactKey("Enter")));
    expect(onActivate).toHaveBeenCalledWith(0);
  });

  it("does not call onActivate when focusedIndex is -1", () => {
    const onActivate = vi.fn();
    const { result } = hook(3, onActivate);
    act(() => result.current.onKeyDown(reactKey("Enter")));
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe("focusedIndex resets when count changes", () => {
  it("resets to -1 when count changes", () => {
    const { result, rerender } = hook(3);
    act(() => result.current.onKeyDown(reactKey("ArrowDown")));
    expect(result.current.focusedIndex).toBe(0);
    rerender({ c: 5, fn: undefined });
    expect(result.current.focusedIndex).toBe(-1);
  });
});
