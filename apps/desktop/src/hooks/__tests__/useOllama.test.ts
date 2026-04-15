import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { DownloadProgress } from "../../lib/tauri";

// ── Mocks ─────────────────────────────────────────────────────

const mockAiCheckOllama = vi.fn();
const mockAiListModels = vi.fn();
const mockAiPullModel = vi.fn();

vi.mock("../../lib/tauri", () => ({
  aiCheckOllama: mockAiCheckOllama,
  aiListModels: mockAiListModels,
  aiPullModel: mockAiPullModel,
}));

// Channel mock — exposes onmessage so tests can push progress events
const mockChannelInstance = { onmessage: null as ((p: DownloadProgress) => void) | null };
vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    set onmessage(fn: (p: DownloadProgress) => void) {
      mockChannelInstance.onmessage = fn;
    }
  },
}));

// ── Setup / teardown ──────────────────────────────────────────

beforeEach(() => {
  mockAiCheckOllama.mockReset();
  mockAiListModels.mockReset();
  mockAiPullModel.mockReset();
  mockChannelInstance.onmessage = null;

  // Default: Ollama not running
  mockAiCheckOllama.mockResolvedValue({ running: false });
  mockAiListModels.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllTimers();
});

// ── Import after mocks ────────────────────────────────────────

const { useOllama } = await import("../useOllama");

// ── Tests ─────────────────────────────────────────────────────

describe("initial state", () => {
  it("starts checking with running=false", () => {
    const { result } = renderHook(() => useOllama());
    expect(result.current.checking).toBe(true);
    expect(result.current.running).toBe(false);
    expect(result.current.timedOut).toBe(false);
    expect(result.current.models).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

describe("Ollama comes up", () => {
  it("sets running=true and eagerly loads models when Ollama responds", async () => {
    const models = [{ name: "llama3.2:3b", size: 2_000_000_000, modified_at: null }];
    mockAiCheckOllama.mockResolvedValue({ running: true });
    mockAiListModels.mockResolvedValue(models);

    const { result } = renderHook(() => useOllama());

    await waitFor(() => {
      expect(result.current.running).toBe(true);
    });

    expect(result.current.checking).toBe(false);
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.models).toEqual(models);
    });
  });
});

describe("timeout after MAX_POLLS", () => {
  it("sets timedOut=true after 15 failed polls", async () => {
    vi.useFakeTimers();
    mockAiCheckOllama.mockResolvedValue({ running: false });

    const { result } = renderHook(() => useOllama());

    // Advance through 15 poll intervals (2000ms each), draining microtasks each time
    for (let i = 0; i < 15; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }

    expect(result.current.timedOut).toBe(true);
    expect(result.current.running).toBe(false);
    expect(result.current.checking).toBe(false);
  });
});

describe("retry()", () => {
  it("resets timedOut and restarts polling — connects when Ollama is back", async () => {
    vi.useFakeTimers();
    mockAiCheckOllama.mockResolvedValue({ running: false });

    const { result } = renderHook(() => useOllama());

    // Force timeout — 15 failed polls
    for (let i = 0; i < 15; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }

    expect(result.current.timedOut).toBe(true);

    // Ollama comes back up
    mockAiCheckOllama.mockResolvedValue({ running: true });
    mockAiListModels.mockResolvedValue([]);

    // retry() resets state; advance the fake clock so the next interval tick fires
    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.running).toBe(true);
    expect(result.current.timedOut).toBe(false);
  });
});

describe("listModels()", () => {
  it("updates models on success", async () => {
    mockAiCheckOllama.mockResolvedValue({ running: true });
    mockAiListModels.mockResolvedValue([]);

    const { result } = renderHook(() => useOllama());
    await waitFor(() => expect(result.current.running).toBe(true));

    const fresh = [{ name: "mistral:7b", size: 4_000_000_000, modified_at: null }];
    mockAiListModels.mockResolvedValue(fresh);

    await act(async () => {
      await result.current.listModels();
    });

    expect(result.current.models).toEqual(fresh);
  });

  it("sets error on failure", async () => {
    mockAiCheckOllama.mockResolvedValue({ running: true });
    // First call (eager load) resolves fine; subsequent call fails
    mockAiListModels
      .mockResolvedValueOnce([])
      .mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useOllama());
    await waitFor(() => expect(result.current.running).toBe(true));

    await act(async () => {
      await result.current.listModels();
    });

    expect(result.current.error).toContain("network error");
  });
});

describe("pullModel()", () => {
  it("calls aiPullModel with correct model name", async () => {
    mockAiCheckOllama.mockResolvedValue({ running: true });
    mockAiListModels.mockResolvedValue([]);
    mockAiPullModel.mockResolvedValue(undefined);

    const { result } = renderHook(() => useOllama());
    await waitFor(() => expect(result.current.running).toBe(true));

    await act(async () => {
      await result.current.pullModel("tinyllama:1b", () => {});
    });

    expect(mockAiPullModel).toHaveBeenCalledWith("tinyllama:1b", expect.anything());
  });
});
