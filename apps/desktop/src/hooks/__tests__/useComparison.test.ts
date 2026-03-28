import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useComparison } from "../useComparison";

// ── Mock @tauri-apps/api/event ────────────────────────────────
// Capture registered listeners so tests can fire events manually.

type Listener = (event: { payload: unknown }) => void;
const listeners: Record<string, Listener[]> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Listener) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
    // Return an unlisten function
    return () => {
      listeners[event] = listeners[event].filter(l => l !== cb);
    };
  }),
}));

function fire(event: string, payload: unknown) {
  act(() => {
    listeners[event]?.forEach(l => l({ payload }));
  });
}

// ── Fixtures ─────────────────────────────────────────────────

const panelConfig = (id: string) => ({
  panelId: id,
  harnessId: "claude",
  harnessName: "Claude Code",
  outputLines: [],
  status: "pending" as const,
  exitCode: null,
  durationMs: 0,
  startedAt: null,
});

// ── Tests ─────────────────────────────────────────────────────

describe("useComparison — event subscription", () => {
  beforeEach(() => {
    Object.keys(listeners).forEach(k => delete listeners[k]);
  });

  it("registers listeners when start() is called", async () => {
    const { result } = renderHook(() => useComparison());

    act(() => {
      result.current.start("cmp-1", "hello", "/tmp", [panelConfig("p1")]);
    });

    await waitFor(() => {
      expect(listeners["comparator://output"]).toHaveLength(1);
      expect(listeners["comparator://complete"]).toHaveLength(1);
    });
  });

  it("appends output to correct panel when event fires", async () => {
    const { result } = renderHook(() => useComparison());

    act(() => {
      result.current.start("cmp-1", "hello", "/tmp", [panelConfig("p1")]);
    });

    await waitFor(() => expect(listeners["comparator://output"]).toHaveLength(1));

    fire("comparator://output", {
      comparisonId: "cmp-1",
      panelId: "p1",
      stream: "stdout",
      data: "Hello from Claude\r\n",
    });

    await waitFor(() => {
      const p1 = result.current.state.panels.find(p => p.panelId === "p1")!;
      expect(p1.outputLines).toContain("Hello from Claude\r\n");
    });
  });

  it("ignores output for a different comparisonId", async () => {
    const { result } = renderHook(() => useComparison());

    act(() => {
      result.current.start("cmp-1", "hello", "/tmp", [panelConfig("p1")]);
    });

    await waitFor(() => expect(listeners["comparator://output"]).toHaveLength(1));

    fire("comparator://output", {
      comparisonId: "cmp-WRONG",
      panelId: "p1",
      stream: "stdout",
      data: "should be ignored",
    });

    expect(result.current.state.panels[0].outputLines).toHaveLength(0);
  });

  it("transitions to complete when all panels receive complete event", async () => {
    const { result } = renderHook(() => useComparison());

    act(() => {
      result.current.start("cmp-1", "hello", "/tmp", [panelConfig("p1")]);
    });

    await waitFor(() => expect(listeners["comparator://complete"]).toHaveLength(1));

    fire("comparator://complete", {
      comparisonId: "cmp-1",
      panelId: "p1",
      exitCode: 0,
      durationMs: 3200,
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe("complete");
    });
  });

  it("cleans up listeners on unmount", async () => {
    const { result, unmount } = renderHook(() => useComparison());

    act(() => {
      result.current.start("cmp-1", "hello", "/tmp", [panelConfig("p1")]);
    });

    await waitFor(() => expect(listeners["comparator://output"]).toHaveLength(1));

    unmount();

    expect(listeners["comparator://output"]).toHaveLength(0);
  });
});
