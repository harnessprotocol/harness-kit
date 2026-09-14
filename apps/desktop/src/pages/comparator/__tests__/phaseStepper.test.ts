import { describe, it, expect } from "vitest";
import { PHASES, PHASE_INDEX, getPhaseStepStatuses } from "../phaseStepper";

describe("phaseStepper", () => {
  it("PHASE_INDEX matches PHASES' actual order (regression: stayed at the old 4-phase numbering after Execution was removed)", () => {
    expect(PHASES.map(p => p.key)).toEqual(["setup", "results", "judge"]);
    expect(PHASE_INDEX.setup).toBe(0);
    expect(PHASE_INDEX.results).toBe(1);
    expect(PHASE_INDEX.judge).toBe(2);
  });

  it("marks every step correctly on 'setup' (first step active, rest pending)", () => {
    expect(getPhaseStepStatuses("setup")).toEqual([
      { key: "setup", status: "active" },
      { key: "results", status: "pending" },
      { key: "judge", status: "pending" },
    ]);
  });

  it("marks every step correctly on 'results' (setup done, results active, judge pending)", () => {
    expect(getPhaseStepStatuses("results")).toEqual([
      { key: "setup", status: "done" },
      { key: "results", status: "active" },
      { key: "judge", status: "pending" },
    ]);
  });

  it("marks every step correctly on 'judge' (setup + results done, judge active)", () => {
    expect(getPhaseStepStatuses("judge")).toEqual([
      { key: "setup", status: "done" },
      { key: "results", status: "done" },
      { key: "judge", status: "active" },
    ]);
  });

  it("exactly one step is 'active' for every reachable phase", () => {
    for (const phase of PHASES.map(p => p.key)) {
      const statuses = getPhaseStepStatuses(phase);
      expect(statuses.filter(s => s.status === "active")).toHaveLength(1);
    }
  });
});
