import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { StreamEvent } from "../../lib/tauri";
import type { TranscriptRow } from "../useAIChat";

// ── Mocks ─────────────────────────────────────────────────────

const mockAiCreateSession = vi.fn();
const mockAiUpdateSessionTitle = vi.fn();
const mockAiDeleteSession = vi.fn();
const mockAiListSessions = vi.fn();
const mockAiLoadSession = vi.fn();
const mockAiSaveMessage = vi.fn();
const mockAiStreamChat = vi.fn();
const mockAiCancelStream = vi.fn();

vi.mock("../../lib/tauri", () => ({
  aiCreateSession: mockAiCreateSession,
  aiUpdateSessionTitle: mockAiUpdateSessionTitle,
  aiDeleteSession: mockAiDeleteSession,
  aiListSessions: mockAiListSessions,
  aiLoadSession: mockAiLoadSession,
  aiSaveMessage: mockAiSaveMessage,
  aiStreamChat: mockAiStreamChat,
  aiCancelStream: mockAiCancelStream,
}));

// Channel mock — lets tests drive streaming events
let channelOnMessage: ((event: StreamEvent) => void) | null = null;
vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    set onmessage(fn: (event: StreamEvent) => void) {
      channelOnMessage = fn;
    }
  },
}));

// ── Stable crypto.randomUUID stub ─────────────────────────────

let uuidCounter = 0;
vi.stubGlobal("crypto", {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

// ── Setup / teardown ──────────────────────────────────────────

beforeEach(() => {
  uuidCounter = 0;
  channelOnMessage = null;
  mockAiCreateSession.mockReset().mockResolvedValue(undefined);
  mockAiUpdateSessionTitle.mockReset().mockResolvedValue(undefined);
  mockAiDeleteSession.mockReset().mockResolvedValue(undefined);
  mockAiListSessions.mockReset().mockResolvedValue([]);
  mockAiLoadSession.mockReset();
  mockAiSaveMessage.mockReset().mockResolvedValue(undefined);
  mockAiStreamChat.mockReset().mockResolvedValue(undefined);
  mockAiCancelStream.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllTimers();
});

// ── Import after mocks ────────────────────────────────────────

const { useAIChat } = await import("../useAIChat");

// ── Helpers ───────────────────────────────────────────────────

function renderChat() {
  return renderHook(() => useAIChat());
}

/** Extract user/assistant rows from transcript (ignores thinking/system/error) */
function messages(rows: TranscriptRow[]) {
  return rows.filter((r): r is Extract<TranscriptRow, { kind: "user" | "assistant" }> =>
    r.kind === "user" || r.kind === "assistant"
  );
}

function sendText(content: string) {
  channelOnMessage!({ kind: "text", data: { content } });
}
function sendDone() {
  channelOnMessage!({ kind: "done", data: {} });
}

// ── Tests ─────────────────────────────────────────────────────

describe("initial state", () => {
  it("starts with empty sessions and no current session", async () => {
    const { result } = renderChat();

    await waitFor(() => {
      expect(mockAiListSessions).toHaveBeenCalledOnce();
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.currentSession).toBeNull();
    expect(result.current.transcript).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("loads existing sessions on mount", async () => {
    const sessions = [
      { id: "s1", title: "Session 1", model: "llama3.2:3b", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    mockAiListSessions.mockResolvedValue(sessions);

    const { result } = renderChat();
    await waitFor(() => expect(result.current.sessions).toEqual(sessions));
  });
});

describe("createSession()", () => {
  it("creates session, sets currentSession and returns id", async () => {
    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    let sessionId!: string;
    await act(async () => {
      sessionId = await result.current.createSession("llama3.2:3b");
    });

    expect(mockAiCreateSession).toHaveBeenCalledWith(expect.stringContaining("test-uuid"), "llama3.2:3b");
    expect(result.current.currentSession).not.toBeNull();
    expect(result.current.currentSession?.model).toBe("llama3.2:3b");
    expect(result.current.sessions).toHaveLength(1);
    expect(sessionId).toBe(result.current.currentSession?.id);
  });

  it("starts with empty transcript", async () => {
    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    await act(async () => {
      await result.current.createSession("llama3.2:3b");
    });

    expect(result.current.transcript).toEqual([]);
  });
});

describe("deleteSession()", () => {
  it("removes session from list and clears currentSession if it was active", async () => {
    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    await act(async () => {
      await result.current.createSession("llama3.2:3b");
    });

    const deletedId = result.current.currentSession!.id;

    await act(async () => {
      await result.current.deleteSession(deletedId);
    });

    expect(mockAiDeleteSession).toHaveBeenCalledWith(deletedId);
    expect(result.current.sessions).toHaveLength(0);
    expect(result.current.currentSession).toBeNull();
    expect(result.current.transcript).toEqual([]);
  });
});

describe("renameSession()", () => {
  it("updates title in sessions list and currentSession", async () => {
    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    await act(async () => {
      await result.current.createSession("llama3.2:3b");
    });

    const id = result.current.currentSession!.id;

    await act(async () => {
      await result.current.renameSession(id, "My Chat");
    });

    expect(mockAiUpdateSessionTitle).toHaveBeenCalledWith(id, "My Chat");
    expect(result.current.sessions[0].title).toBe("My Chat");
    expect(result.current.currentSession?.title).toBe("My Chat");
  });
});

describe("loadSession()", () => {
  it("hydrates transcript from stored messages", async () => {
    const session = { id: "s1", title: "Loaded", model: "llama3.2:3b", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const msgs = [
      { id: "m1", sessionId: "s1", role: "user", content: "hello", timestamp: new Date().toISOString() },
      { id: "m2", sessionId: "s1", role: "assistant", content: "hi there", timestamp: new Date().toISOString() },
    ];
    mockAiLoadSession.mockResolvedValue([session, msgs]);

    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    await act(async () => {
      await result.current.loadSession("s1");
    });

    expect(result.current.currentSession).toEqual(session);
    const rows = messages(result.current.transcript);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe("user");
    expect(rows[1].kind).toBe("assistant");
  });

  it("sets error if loadSession throws", async () => {
    mockAiLoadSession.mockRejectedValue(new Error("not found"));

    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    await act(async () => {
      await result.current.loadSession("missing");
    });

    expect(result.current.error).toContain("not found");
  });
});

describe("sendMessage() — streaming", () => {
  it("appends user row, then assistant row after stream completes", async () => {
    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    await act(async () => {
      await result.current.createSession("llama3.2:3b");
    });

    let streamResolve!: () => void;
    mockAiStreamChat.mockImplementation(() => new Promise<void>(res => { streamResolve = res; }));

    act(() => {
      void result.current.sendMessage("Hello", "llama3.2:3b");
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    // User row appears immediately (+ thinking row)
    await waitFor(() => messages(result.current.transcript).length >= 1);
    const userRows = messages(result.current.transcript);
    expect(userRows[0].kind).toBe("user");
    expect(userRows[0].content).toBe("Hello");

    // Drive streaming chunks
    await act(async () => { sendText("Hi "); });
    await act(async () => { sendText("there!"); sendDone(); });

    // Resolve stream promise
    await act(async () => { streamResolve(); });

    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    const finalRows = messages(result.current.transcript);
    expect(finalRows).toHaveLength(2);
    expect(finalRows[1].kind).toBe("assistant");
    expect(finalRows[1].content).toBe("Hi there!");
    expect((finalRows[1] as Extract<TranscriptRow, { kind: "assistant" }>).streaming).toBeFalsy();
  });

  it("auto-titles the session from first user message when session is untitled", async () => {
    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    await act(async () => {
      await result.current.createSession("llama3.2:3b");
    });

    let streamResolve!: () => void;
    mockAiStreamChat.mockImplementation(() => new Promise<void>(res => { streamResolve = res; }));

    act(() => { void result.current.sendMessage("Tell me about Rust", "llama3.2:3b"); });
    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    await act(async () => { sendText("Rust is..."); sendDone(); });
    await act(async () => { streamResolve(); });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    expect(mockAiUpdateSessionTitle).toHaveBeenCalledWith(
      expect.any(String),
      "Tell me about Rust",
    );
  });

  it("sets error state when aiStreamChat rejects", async () => {
    mockAiStreamChat.mockRejectedValue(new Error("connection refused"));

    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    await act(async () => {
      await result.current.createSession("llama3.2:3b");
    });

    await act(async () => {
      await result.current.sendMessage("hello", "llama3.2:3b");
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toContain("connection refused");
    // Error row appears in transcript
    expect(result.current.transcript.some((r) => r.kind === "error")).toBe(true);
  });

  it("commits partial response if stream ends without done event", async () => {
    let streamResolve!: () => void;
    mockAiStreamChat.mockImplementation(() => new Promise<void>(res => { streamResolve = res; }));

    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    await act(async () => { await result.current.createSession("llama3.2:3b"); });
    act(() => { void result.current.sendMessage("hello", "llama3.2:3b"); });
    await waitFor(() => expect(result.current.isStreaming).toBe(true));

    // Partial chunk but no done event
    await act(async () => { sendText("partial..."); });
    await act(async () => { streamResolve(); }); // stream resolves without done

    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    const assistantRows = messages(result.current.transcript).filter((r) => r.kind === "assistant");
    expect(assistantRows).toHaveLength(1);
    expect(assistantRows[0].content).toBe("partial...");
    expect((assistantRows[0] as Extract<TranscriptRow, { kind: "assistant" }>).incomplete).toBe(true);
  });
});

describe("cancelStream()", () => {
  it("calls aiCancelStream", () => {
    const { result } = renderHook(() => useAIChat());
    act(() => result.current.cancelStream());
    expect(mockAiCancelStream).toHaveBeenCalledOnce();
  });
});

describe("refreshSessions()", () => {
  it("fetches and updates sessions list", async () => {
    const { result } = renderChat();
    await waitFor(() => expect(mockAiListSessions).toHaveBeenCalled());

    const fresh = [
      { id: "fresh1", title: "Fresh", model: "llama3.2:3b", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    mockAiListSessions.mockResolvedValue(fresh);

    await act(async () => {
      await result.current.refreshSessions();
    });

    expect(result.current.sessions).toEqual(fresh);
  });
});
