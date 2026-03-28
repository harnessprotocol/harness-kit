import { describe, it, expect } from "vitest";
import { reducer } from "../useComparison";
import type { ComparisonState } from "../useComparison";

const panel = (id: string) => ({
  panelId: id,
  harnessId: "claude",
  harnessName: "Claude Code",
  outputLines: [],
  status: "pending" as const,
  exitCode: null,
  durationMs: 0,
  startedAt: null,
});

const initial: ComparisonState = {
  comparisonId: "",
  prompt: "",
  workingDir: "",
  panels: [],
  phase: "setup",
  diffs: null,
};

const running: ComparisonState = {
  comparisonId: "cmp-1",
  prompt: "hello",
  workingDir: "/tmp",
  panels: [
    { ...panel("p1"), status: "running", startedAt: Date.now() },
    { ...panel("p2"), status: "running", startedAt: Date.now() },
  ],
  phase: "running",
  diffs: null,
};

describe("reducer — START", () => {
  it("sets phase to running and initializes panels", () => {
    const state = reducer(initial, {
      type: "START",
      comparisonId: "cmp-1",
      prompt: "hello",
      workingDir: "/tmp",
      panels: [panel("p1"), panel("p2")],
    });
    expect(state.phase).toBe("running");
    expect(state.comparisonId).toBe("cmp-1");
    expect(state.panels).toHaveLength(2);
    expect(state.panels[0].status).toBe("running");
    expect(state.panels[0].startedAt).not.toBeNull();
  });
});

describe("reducer — OUTPUT", () => {
  it("appends line to correct panel only", () => {
    const state = reducer(running, { type: "OUTPUT", panelId: "p1", data: "hello\r\n" });
    expect(state.panels.find(p => p.panelId === "p1")!.outputLines).toEqual(["hello\r\n"]);
    expect(state.panels.find(p => p.panelId === "p2")!.outputLines).toHaveLength(0);
  });

  it("accumulates multiple lines", () => {
    let state = reducer(running, { type: "OUTPUT", panelId: "p1", data: "line1\n" });
    state = reducer(state, { type: "OUTPUT", panelId: "p1", data: "line2\n" });
    expect(state.panels.find(p => p.panelId === "p1")!.outputLines).toHaveLength(2);
  });
});

describe("reducer — COMPLETE", () => {
  it("stores exit code on panel", () => {
    const state = reducer(running, { type: "COMPLETE", panelId: "p1", exitCode: 0, durationMs: 1500 });
    const p1 = state.panels.find(p => p.panelId === "p1")!;
    expect(p1.status).toBe("complete");
    expect(p1.exitCode).toBe(0);
    expect(p1.durationMs).toBe(1500);
  });

  it("stays running while other panels are still running", () => {
    const state = reducer(running, { type: "COMPLETE", panelId: "p1", exitCode: 0, durationMs: 100 });
    expect(state.phase).toBe("running");
  });

  it("transitions to complete when all panels done", () => {
    let state = reducer(running, { type: "COMPLETE", panelId: "p1", exitCode: 0, durationMs: 100 });
    state = reducer(state, { type: "COMPLETE", panelId: "p2", exitCode: 0, durationMs: 200 });
    expect(state.phase).toBe("complete");
  });
});

describe("reducer — KILL", () => {
  it("sets panel status to killed", () => {
    const state = reducer(running, { type: "KILL", panelId: "p1" });
    expect(state.panels.find(p => p.panelId === "p1")!.status).toBe("killed");
  });

  it("transitions to complete when remaining panels are done", () => {
    let state = reducer(running, { type: "COMPLETE", panelId: "p1", exitCode: 0, durationMs: 100 });
    state = reducer(state, { type: "KILL", panelId: "p2" });
    expect(state.phase).toBe("complete");
  });
});

describe("reducer — DIFFS_LOADED", () => {
  it("stores diffs under panel ID", () => {
    const diffs = [{ filePath: "foo.ts", diffText: "...", changeType: "modified" as const }];
    const state = reducer(running, { type: "DIFFS_LOADED", panelId: "p1", diffs });
    expect(state.diffs?.["p1"]).toEqual(diffs);
  });
});

describe("reducer — RESET", () => {
  it("returns initial state", () => {
    const state = reducer(running, { type: "RESET" });
    expect(state.phase).toBe("setup");
    expect(state.panels).toHaveLength(0);
    expect(state.comparisonId).toBe("");
  });
});
