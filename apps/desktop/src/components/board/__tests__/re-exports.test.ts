import { describe, it, expect } from "vitest";

describe("board component re-exports", () => {
  it("re-exports TaskCard from @harness-kit/board-ui", async () => {
    const mod = await import("../TaskCard");
    expect(mod.TaskCard).toBeDefined();
    expect(typeof mod.TaskCard).toBe("function");
  });

  it("re-exports TaskForm from @harness-kit/board-ui", async () => {
    const mod = await import("../TaskForm");
    expect(mod.TaskForm).toBeDefined();
    expect(typeof mod.TaskForm).toBe("function");
  });

  it("re-exports TaskDetailPanel from @harness-kit/board-ui", async () => {
    const mod = await import("../TaskDetailPanel");
    expect(mod.TaskDetailPanel).toBeDefined();
    expect(typeof mod.TaskDetailPanel).toBe("function");
  });

  it("re-exports DroppableColumn from @harness-kit/board-ui", async () => {
    const mod = await import("../DroppableColumn");
    expect(mod.DroppableColumn).toBeDefined();
    expect(typeof mod.DroppableColumn).toBe("function");
  });

  it("re-exports CommentThread from @harness-kit/board-ui", async () => {
    const mod = await import("../CommentThread");
    expect(mod.CommentThread).toBeDefined();
    expect(typeof mod.CommentThread).toBe("function");
  });

  it("re-exports SortableTaskCard from @harness-kit/board-ui", async () => {
    const mod = await import("../SortableTaskCard");
    expect(mod.SortableTaskCard).toBeDefined();
    expect(typeof mod.SortableTaskCard).toBe("function");
  });

  it("re-exports SwimlaneView from @harness-kit/board-ui", async () => {
    const mod = await import("../SwimlaneView");
    expect(mod.SwimlaneView).toBeDefined();
    expect(typeof mod.SwimlaneView).toBe("function");
  });

  it("re-exports Tooltip from @harness-kit/board-ui", async () => {
    const mod = await import("../Tooltip");
    expect(mod.Tooltip).toBeDefined();
    expect(typeof mod.Tooltip).toBe("function");
  });

  it("re-exports ViewToggle from @harness-kit/board-ui", async () => {
    const mod = await import("../ViewToggle");
    expect(mod.ViewToggle).toBeDefined();
    expect(typeof mod.ViewToggle).toBe("function");
  });
});
