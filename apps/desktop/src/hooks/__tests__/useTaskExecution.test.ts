import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useTaskExecution } from "../useTaskExecution";
import type { Task, Project } from "../../lib/board-api";

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

// ── board-api mock ─────────────────────────────────────────────

const mockUpdateExecution = vi.fn().mockResolvedValue({});
const mockUpdateTask = vi.fn().mockResolvedValue({});

vi.mock("../../lib/board-api", () => ({
  api: {
    tasks: {
      updateExecution: (...a: unknown[]) => mockUpdateExecution(...a),
      update: (...a: unknown[]) => mockUpdateTask(...a),
    },
  },
}));

// ── Wire-format helpers ────────────────────────────────────────

function emitOutput(terminalId: string, data: string) {
  listeners["terminal://output"]?.({ payload: { terminalId, data } });
}

function emitExit(terminalId: string, exitCode: number) {
  listeners["terminal://exit"]?.({ payload: { terminalId, exitCode } });
}

// ── Fixtures ───────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: "Fix the login bug",
    status: "in-progress",
    linked_commits: [],
    comments: [],
    subtasks: [],
    next_subtask_id: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    name: "My Project",
    slug: "my-project",
    next_id: 2,
    version: 1,
    epics: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "create_terminal") return Promise.resolve("term-1");
    if (cmd === "write_terminal") return Promise.resolve();
    if (cmd === "destroy_terminal") return Promise.resolve();
    return Promise.resolve();
  });
});

// ── Tests ──────────────────────────────────────────────────────

describe("useTaskExecution — prompt construction", () => {
  it("builds prompt with task id and title", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({ id: 42, title: "Refactor auth module" });

    await act(async () => {
      await result.current.startTask("proj", task, makeProject());
    });

    expect(mockInvoke).toHaveBeenCalledWith("write_terminal", expect.objectContaining({
      data: expect.stringContaining("Work on board task #42: Refactor auth module"),
    }));
  });

  it("appends task description when present", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({ description: "Use JWT tokens instead of sessions." });

    await act(async () => {
      await result.current.startTask("proj", task, makeProject());
    });

    expect(mockInvoke).toHaveBeenCalledWith("write_terminal", expect.objectContaining({
      data: expect.stringContaining("Use JWT tokens instead of sessions."),
    }));
  });

  it("omits description section when task has no description", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({ description: undefined });

    await act(async () => {
      await result.current.startTask("proj", task, makeProject());
    });

    const call = (mockInvoke as Mock).mock.calls.find(
      ([cmd]) => cmd === "write_terminal",
    );
    const data: string = call![1].data;
    // Should be title line only, no blank-line-then-description
    expect(data.trim()).toBe("claude 'Work on board task #1: Fix the login bug' --permission-mode auto\n".trim());
  });

  it("appends pending subtasks to prompt", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({
      subtasks: [
        { id: 1, title: "Write unit tests", status: "pending", files: [] },
        { id: 2, title: "Update README", status: "in_progress", files: [] },
        { id: 3, title: "Deploy to staging", status: "completed", files: [] },
      ],
    });

    await act(async () => {
      await result.current.startTask("proj", task, makeProject());
    });

    expect(mockInvoke).toHaveBeenCalledWith("write_terminal", expect.objectContaining({
      data: expect.stringContaining("Write unit tests"),
    }));
    expect(mockInvoke).toHaveBeenCalledWith("write_terminal", expect.objectContaining({
      data: expect.stringContaining("Update README"),
    }));
  });

  it("excludes completed and failed subtasks from prompt", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({
      subtasks: [
        { id: 1, title: "Done subtask", status: "completed", files: [] },
        { id: 2, title: "Failed subtask", status: "failed", files: [] },
        { id: 3, title: "Pending subtask", status: "pending", files: [] },
      ],
    });

    await act(async () => {
      await result.current.startTask("proj", task, makeProject());
    });

    const call = (mockInvoke as Mock).mock.calls.find(
      ([cmd]) => cmd === "write_terminal",
    );
    const data: string = call![1].data;
    expect(data).not.toContain("Done subtask");
    expect(data).not.toContain("Failed subtask");
    expect(data).toContain("Pending subtask");
  });

  it("omits subtask section when all subtasks are completed", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({
      subtasks: [
        { id: 1, title: "Done", status: "completed", files: [] },
      ],
    });

    await act(async () => {
      await result.current.startTask("proj", task, makeProject());
    });

    const call = (mockInvoke as Mock).mock.calls.find(
      ([cmd]) => cmd === "write_terminal",
    );
    const data: string = call![1].data;
    expect(data).not.toContain("Pending subtasks");
  });
});

describe("useTaskExecution — harness resolution", () => {
  it("uses task.default_harness when set", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({ default_harness: "codex" });
    const project = makeProject({ default_harness: "claude" });

    await act(async () => {
      await result.current.startTask("proj", task, project);
    });

    // codex uses positional prompt, no --permission-mode flag
    const call = (mockInvoke as Mock).mock.calls.find(([cmd]) => cmd === "write_terminal");
    expect(call![1].data).toMatch(/^opencode|^codex|^agent/);
  });

  it("falls back to project.default_harness when task has none", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({ default_harness: undefined });
    const project = makeProject({ default_harness: "cursor-agent" });

    await act(async () => {
      await result.current.startTask("proj", task, project);
    });

    const call = (mockInvoke as Mock).mock.calls.find(([cmd]) => cmd === "write_terminal");
    expect(call![1].data).toMatch(/^agent /);
  });

  it("falls back to claude when neither task nor project specifies a harness", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({ default_harness: undefined });
    const project = makeProject({ default_harness: undefined });

    await act(async () => {
      await result.current.startTask("proj", task, project);
    });

    const call = (mockInvoke as Mock).mock.calls.find(([cmd]) => cmd === "write_terminal");
    expect(call![1].data).toMatch(/^claude /);
    expect(call![1].data).toContain("--permission-mode auto");
  });
});

describe("useTaskExecution — model resolution", () => {
  it("uses task.default_model when set", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({ default_model: "claude-opus-4-6" });
    const project = makeProject({ default_model: "claude-haiku-4-5" });

    await act(async () => {
      await result.current.startTask("proj", task, project);
    });

    const call = (mockInvoke as Mock).mock.calls.find(([cmd]) => cmd === "write_terminal");
    expect(call![1].data).toContain("--model claude-opus-4-6");
    expect(call![1].data).not.toContain("claude-haiku-4-5");
  });

  it("falls back to project.default_model when task has none", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({ default_model: undefined });
    const project = makeProject({ default_model: "claude-sonnet-4-6" });

    await act(async () => {
      await result.current.startTask("proj", task, project);
    });

    const call = (mockInvoke as Mock).mock.calls.find(([cmd]) => cmd === "write_terminal");
    expect(call![1].data).toContain("--model claude-sonnet-4-6");
  });

  it("omits --model flag when no model is configured", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const task = makeTask({ default_model: undefined });
    const project = makeProject({ default_model: undefined });

    await act(async () => {
      await result.current.startTask("proj", task, project);
    });

    const call = (mockInvoke as Mock).mock.calls.find(([cmd]) => cmd === "write_terminal");
    expect(call![1].data).not.toContain("--model");
  });
});

describe("useTaskExecution — execution state", () => {
  it("marks task as running after startTask", async () => {
    const { result } = renderHook(() => useTaskExecution());

    await act(async () => {
      await result.current.startTask("proj", makeTask(), makeProject());
    });

    expect(mockUpdateExecution).toHaveBeenCalledWith("proj", 1, expect.objectContaining({
      status: "running",
      harness_id: "claude",
    }));
    expect(mockUpdateTask).toHaveBeenCalledWith("proj", 1, { status: "in-progress" });
  });

  it("isRunning returns true for active tasks", async () => {
    const { result } = renderHook(() => useTaskExecution());

    await act(async () => {
      await result.current.startTask("proj", makeTask(), makeProject());
    });

    expect(result.current.isRunning(1)).toBe(true);
  });

  it("isRunning returns false for tasks that haven't started", () => {
    const { result } = renderHook(() => useTaskExecution());
    expect(result.current.isRunning(999)).toBe(false);
  });

  it("marks task as completed on exit code 0", async () => {
    const { result } = renderHook(() => useTaskExecution());

    await act(async () => {
      await result.current.startTask("proj", makeTask(), makeProject());
    });

    await act(async () => {
      emitExit("term-1", 0);
    });

    await waitFor(() => {
      expect(mockUpdateExecution).toHaveBeenCalledWith("proj", 1, expect.objectContaining({
        status: "completed",
        exit_code: 0,
      }));
    });
    expect(result.current.isRunning(1)).toBe(false);
  });

  it("marks task as failed on non-zero exit code", async () => {
    const { result } = renderHook(() => useTaskExecution());

    await act(async () => {
      await result.current.startTask("proj", makeTask(), makeProject());
    });

    await act(async () => {
      emitExit("term-1", 1);
    });

    await waitFor(() => {
      expect(mockUpdateExecution).toHaveBeenCalledWith("proj", 1, expect.objectContaining({
        status: "failed",
        exit_code: 1,
      }));
    });
  });

  it("marks task as stopped after stopTask", async () => {
    const { result } = renderHook(() => useTaskExecution());

    await act(async () => {
      await result.current.startTask("proj", makeTask(), makeProject());
    });

    await act(async () => {
      await result.current.stopTask("proj", 1);
    });

    expect(mockUpdateExecution).toHaveBeenCalledWith("proj", 1, expect.objectContaining({
      status: "stopped",
    }));
    expect(result.current.isRunning(1)).toBe(false);
  });

  it("accumulates terminal output chunks", async () => {
    const { result } = renderHook(() => useTaskExecution());

    await act(async () => {
      await result.current.startTask("proj", makeTask(), makeProject());
    });

    act(() => { emitOutput("term-1", "line 1\n"); });
    act(() => { emitOutput("term-1", "line 2\n"); });

    await waitFor(() => {
      expect(result.current.getOutput(1)).toContain("line 1\n");
      expect(result.current.getOutput(1)).toContain("line 2\n");
    });
  });

  it("canStartMore returns false when at max_concurrent limit", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const project = makeProject({ max_concurrent: 1 });

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "create_terminal") return Promise.resolve(`term-${Date.now()}`);
      return Promise.resolve();
    });

    await act(async () => {
      await result.current.startTask("proj", makeTask({ id: 1 }), project);
    });

    expect(result.current.canStartMore(project)).toBe(false);
  });

  it("canStartMore returns true when below max_concurrent limit", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const project = makeProject({ max_concurrent: 3 });
    expect(result.current.canStartMore(project)).toBe(true);
  });

  it("throws when max_concurrent limit is reached", async () => {
    const { result } = renderHook(() => useTaskExecution());
    const project = makeProject({ max_concurrent: 1 });

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "create_terminal") return Promise.resolve(`term-${Math.random()}`);
      return Promise.resolve();
    });

    await act(async () => {
      await result.current.startTask("proj", makeTask({ id: 1 }), project);
    });

    await expect(
      act(async () => {
        await result.current.startTask("proj", makeTask({ id: 2 }), project);
      }),
    ).rejects.toThrow(/Concurrent task limit/);
  });
});
