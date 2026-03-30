import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useTerminals } from "../useTerminals";

// ── Tauri mocks ────────────────────────────────────────────────

const mockInvoke = vi.fn();
const mockUnlisten = vi.fn();
type ListenerFn = (event: { payload: unknown }) => void;
const listeners: Record<string, ListenerFn> = {};

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => mockInvoke(...a) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((eventName: string, callback: ListenerFn) => {
    listeners[eventName] = callback;
    return Promise.resolve(mockUnlisten);
  }),
}));

// ── Wire-format payloads ──────────────────────────────────────
// These MUST match Rust's serde(rename_all = "camelCase") output.
// If the Rust struct field names or serde config change, update
// these AND the corresponding Rust serialization tests in terminal.rs.

function wireOutputPayload(terminalId: string, data: string) {
  return { terminalId, data };
}

function wireExitPayload(terminalId: string, exitCode: number) {
  return { terminalId, exitCode };
}

// ── Helpers ────────────────────────────────────────────────────

function emitOutput(terminalId: string, data: string) {
  listeners["terminal://output"]?.({ payload: wireOutputPayload(terminalId, data) });
}

function emitExit(terminalId: string, exitCode: number) {
  listeners["terminal://exit"]?.({ payload: wireExitPayload(terminalId, exitCode) });
}

// ── Tests ──────────────────────────────────────────────────────

describe("useTerminals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: create_terminal returns a predictable id
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "create_terminal") return Promise.resolve("term-1");
      if (cmd === "destroy_terminal") return Promise.resolve();
      if (cmd === "invoke_in_terminal") return Promise.resolve();
      return Promise.resolve();
    });
  });

  // ── Session lifecycle ──────────────────────────────────────

  it("starts with empty sessions", () => {
    const { result } = renderHook(() => useTerminals());
    expect(result.current.sessions).toEqual([]);
    expect(result.current.maxTerminals).toBe(12);
  });

  it("createTerminal adds a session", async () => {
    const { result } = renderHook(() => useTerminals());

    let id: string | null = null;
    await act(async () => {
      id = await result.current.createTerminal("/project");
    });

    expect(id).toBe("term-1");
    expect(mockInvoke).toHaveBeenCalledWith("create_terminal", { projectPath: "/project" });
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]).toMatchObject({
      id: "term-1",
      title: "Terminal 1",
      status: "idle",
    });
  });

  it("createTerminal increments title counter", async () => {
    let counter = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "create_terminal") return Promise.resolve(`term-${++counter}`);
      return Promise.resolve();
    });

    const { result } = renderHook(() => useTerminals());

    await act(async () => { await result.current.createTerminal("/a"); });
    await act(async () => { await result.current.createTerminal("/b"); });

    expect(result.current.sessions[0].title).toBe("Terminal 1");
    expect(result.current.sessions[1].title).toBe("Terminal 2");
  });

  it("createTerminal returns null at max capacity", async () => {
    let counter = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "create_terminal") return Promise.resolve(`t-${++counter}`);
      return Promise.resolve();
    });

    const { result } = renderHook(() => useTerminals());

    // Fill to max (12)
    for (let i = 0; i < 12; i++) {
      await act(async () => { await result.current.createTerminal("/p"); });
    }
    expect(result.current.sessions).toHaveLength(12);

    // 13th should return null
    let id: string | null = "not-null";
    await act(async () => {
      id = await result.current.createTerminal("/p");
    });
    expect(id).toBeNull();
    expect(result.current.sessions).toHaveLength(12);
  });

  it("destroyTerminal removes a session and invokes backend", async () => {
    const { result } = renderHook(() => useTerminals());

    await act(async () => { await result.current.createTerminal("/p"); });
    expect(result.current.sessions).toHaveLength(1);

    act(() => { result.current.destroyTerminal("term-1"); });

    expect(mockInvoke).toHaveBeenCalledWith("destroy_terminal", { terminalId: "term-1" });
    expect(result.current.sessions).toHaveLength(0);
  });

  // ── Harness assignment ─────────────────────────────────────

  it("assignHarness updates session harnessId and model", async () => {
    const { result } = renderHook(() => useTerminals());

    await act(async () => { await result.current.createTerminal("/p"); });

    act(() => {
      result.current.assignHarness("term-1", "claude", "claude-sonnet-4-6");
    });

    expect(result.current.sessions[0]).toMatchObject({
      harnessId: "claude",
      model: "claude-sonnet-4-6",
    });
  });

  // ── Invoke ─────────────────────────────────────────────────

  it("invokeInTerminal builds command and writes to terminal", async () => {
    const { result } = renderHook(() => useTerminals());

    await act(async () => { await result.current.createTerminal("/p"); });
    await act(async () => {
      await result.current.invokeInTerminal("term-1", "claude", "fix bug", "claude-opus-4-6");
    });

    // Should call write_terminal (not invoke_in_terminal) with the built command
    // Interactive mode (no -p) for full TUI with live streaming
    expect(mockInvoke).toHaveBeenCalledWith("write_terminal", {
      terminalId: "term-1",
      data: "claude 'fix bug' --model claude-opus-4-6\n",
    });
    expect(result.current.sessions[0].status).toBe("running");
    expect(result.current.sessions[0].harnessId).toBe("claude");
  });

  it("invokeAll invokes only sessions with assigned harnesses", async () => {
    let counter = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "create_terminal") return Promise.resolve(`t-${++counter}`);
      return Promise.resolve();
    });

    const { result } = renderHook(() => useTerminals());

    await act(async () => { await result.current.createTerminal("/p"); });
    await act(async () => { await result.current.createTerminal("/p"); });

    // Only assign harness to first terminal
    act(() => { result.current.assignHarness("t-1", "claude", "sonnet"); });

    await act(async () => { await result.current.invokeAll("test prompt"); });

    // Should only write to t-1 (has harness), not t-2
    const writeCalls = (mockInvoke as Mock).mock.calls.filter(
      (c: unknown[]) => c[0] === "write_terminal" && (c[1] as { data: string }).data.includes("claude"),
    );
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0][1].terminalId).toBe("t-1");
  });

  // ── Event handling ─────────────────────────────────────────

  it("terminal://output stores chunks and increments outputTick", async () => {
    const { result } = renderHook(() => useTerminals());

    await act(async () => { await result.current.createTerminal("/p"); });

    const tickBefore = result.current.outputTick;

    act(() => { emitOutput("term-1", "hello world"); });

    expect(result.current.outputTick).toBe(tickBefore + 1);
    expect(result.current.getRawChunks("term-1")).toEqual(["hello world"]);
  });

  it("terminal://output accumulates multiple chunks", async () => {
    const { result } = renderHook(() => useTerminals());

    await act(async () => { await result.current.createTerminal("/p"); });

    act(() => {
      emitOutput("term-1", "chunk1");
      emitOutput("term-1", "chunk2");
      emitOutput("term-1", "chunk3");
    });

    expect(result.current.getRawChunks("term-1")).toEqual(["chunk1", "chunk2", "chunk3"]);
  });

  it("terminal://exit sets status to exited with exit code", async () => {
    const { result } = renderHook(() => useTerminals());

    await act(async () => { await result.current.createTerminal("/p"); });

    act(() => { emitExit("term-1", 0); });

    await waitFor(() => {
      expect(result.current.sessions[0]).toMatchObject({
        status: "exited",
        exitCode: 0,
      });
    });
  });

  it("terminal://exit with non-zero exit code", async () => {
    const { result } = renderHook(() => useTerminals());

    await act(async () => { await result.current.createTerminal("/p"); });

    act(() => { emitExit("term-1", 1); });

    await waitFor(() => {
      expect(result.current.sessions[0].exitCode).toBe(1);
    });
  });

  // ── getRawChunks ───────────────────────────────────────────

  it("getRawChunks returns empty array for unknown id", () => {
    const { result } = renderHook(() => useTerminals());
    expect(result.current.getRawChunks("nonexistent")).toEqual([]);
  });

  // ── Cleanup ────────────────────────────────────────────────

  it("unsubscribes event listeners on unmount", async () => {
    const { unmount } = renderHook(() => useTerminals());
    unmount();
    // listen returns a Promise<unlisten>; React cleanup calls the resolved fn
    await waitFor(() => {
      expect(mockUnlisten).toHaveBeenCalledTimes(2); // output + exit
    });
  });
});
