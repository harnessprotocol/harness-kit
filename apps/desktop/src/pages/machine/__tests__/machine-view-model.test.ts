import { describe, expect, it, vi } from "vitest";
import { MACHINE_FIXTURE_INVENTORY } from "../../__fixtures__/machine-fixture-data";
import { inventoryVariants } from "../cell-state";
import {
  filterOf,
  filterRows,
  machineSummaryCells,
  viewOf,
  withFilter,
  withView,
} from "../machine-view-model";

const inventory = MACHINE_FIXTURE_INVENTORY;
const variants = inventoryVariants(inventory);

// Read off the fixture's gaps and diffs by hand, not recomputed: github is
// missing on gemini and codex departs from its baseline; code-review is
// missing on codex and gemini, with one copy everywhere else.
const GAP_ROWS = ["mcp-server:github", "skill:code-review"];
const DIFFERS_ROWS = ["mcp-server:github"];

describe("filterOf", () => {
  it("reads gaps and differs", () => {
    expect(filterOf(new URLSearchParams("filter=gaps"))).toBe("gaps");
    expect(filterOf(new URLSearchParams("filter=differs"))).toBe("differs");
  });

  it("treats a missing or unknown value as all", () => {
    expect(filterOf(new URLSearchParams(""))).toBe("all");
    expect(filterOf(new URLSearchParams("filter=diffs"))).toBe("all");
    expect(filterOf(new URLSearchParams("filter="))).toBe("all");
  });
});

describe("withFilter", () => {
  it("sets the filter and keeps every other param", () => {
    const next = withFilter(new URLSearchParams("view=drift&harness=cursor"), "gaps");
    expect(next.get("filter")).toBe("gaps");
    expect(next.get("view")).toBe("drift");
    expect(next.get("harness")).toBe("cursor");
  });

  it("removes the param for all, and does not mutate its input", () => {
    const current = new URLSearchParams("view=drift&filter=differs");
    const next = withFilter(current, "all");
    expect(next.has("filter")).toBe(false);
    expect(next.get("view")).toBe("drift");
    expect(current.get("filter")).toBe("differs");
  });
});

describe("viewOf", () => {
  it("reads view=drift and view=grid, defaulting to the grid", () => {
    expect(viewOf(new URLSearchParams("view=drift"))).toBe("drift");
    expect(viewOf(new URLSearchParams("view=grid"))).toBe("grid");
    expect(viewOf(new URLSearchParams(""))).toBe("grid");
    expect(viewOf(new URLSearchParams("view=table"))).toBe("grid");
  });

  it("still reads the legacy drift=1 as the Drift view, unless view says otherwise", () => {
    expect(viewOf(new URLSearchParams("drift=1&harness=cursor"))).toBe("drift");
    expect(viewOf(new URLSearchParams("drift=0"))).toBe("grid");
    expect(viewOf(new URLSearchParams("drift=1&view=grid"))).toBe("grid");
  });
});

describe("withView", () => {
  it("sets view=drift and keeps every other param", () => {
    const next = withView(new URLSearchParams("harness=cursor&filter=gaps"), "drift");
    expect(next.get("view")).toBe("drift");
    expect(next.get("harness")).toBe("cursor");
    expect(next.get("filter")).toBe("gaps");
  });

  it("removes the param for the grid, and does not mutate its input", () => {
    const current = new URLSearchParams("view=drift&harness=cursor");
    const next = withView(current, "grid");
    expect(next.has("view")).toBe(false);
    expect(next.get("harness")).toBe("cursor");
    expect(current.get("view")).toBe("drift");
  });

  it("drops the legacy drift=1 either way, so the grid stays reachable", () => {
    expect(viewOf(withView(new URLSearchParams("drift=1"), "grid"))).toBe("grid");
    const drift = withView(new URLSearchParams("drift=1&harness=cursor"), "drift");
    expect(drift.has("drift")).toBe(false);
    expect(drift.toString()).toBe("harness=cursor&view=drift");
  });
});

describe("filterRows", () => {
  it("keeps every row for all", () => {
    expect(filterRows(inventory.rows, variants, "all")).toBe(inventory.rows);
  });

  it("keeps rows with a gap chip for gaps, and rows with a differs chip for differs", () => {
    expect(filterRows(inventory.rows, variants, "gaps").map((row) => row.key)).toEqual(GAP_ROWS);
    expect(filterRows(inventory.rows, variants, "differs").map((row) => row.key)).toEqual(DIFFERS_ROWS);
  });
});

describe("machineSummaryCells", () => {
  it("counts rows, not pairwise diffs, and labels the cell Differs", () => {
    const cells = machineSummaryCells(inventory, variants, "all", vi.fn());
    const byId = Object.fromEntries(cells.map((cell) => [cell.id, cell]));
    expect(byId.gaps.value).toBe(String(GAP_ROWS.length));
    expect(byId.differs.label).toBe("Differs");
    expect(byId.differs.value).toBe(String(DIFFERS_ROWS.length));
    expect(byId.rows.value).toBe(String(inventory.rows.length));
    expect(byId.rows.onSelect).toBeUndefined();
    expect(byId.detected.onSelect).toBeUndefined();
  });

  it("toggles: selecting the inactive cell asks for it, the active cell asks for all", () => {
    const onChange = vi.fn();
    const cells = machineSummaryCells(inventory, variants, "gaps", onChange);
    const gaps = cells.find((cell) => cell.id === "gaps")!;
    const differs = cells.find((cell) => cell.id === "differs")!;
    expect(gaps.active).toBe(true);
    expect(differs.active).toBe(false);
    gaps.onSelect!();
    expect(onChange).toHaveBeenLastCalledWith("all");
    differs.onSelect!();
    expect(onChange).toHaveBeenLastCalledWith("differs");
  });

  it("gives a zero-count cell no onSelect", () => {
    const empty = { ...inventory, rows: inventory.rows.filter((row) => !GAP_ROWS.includes(row.key)), gaps: [] };
    const cells = machineSummaryCells(empty, inventoryVariants(empty), "all", vi.fn());
    const gaps = cells.find((cell) => cell.id === "gaps")!;
    expect(gaps.value).toBe("0");
    expect(gaps.onSelect).toBeUndefined();
  });

  it("keeps the active cell a pressed toggle at zero, so the filter can be cleared", () => {
    const onChange = vi.fn();
    const empty = { ...inventory, rows: inventory.rows.filter((row) => !GAP_ROWS.includes(row.key)), gaps: [] };
    const cells = machineSummaryCells(empty, inventoryVariants(empty), "gaps", onChange);
    const gaps = cells.find((cell) => cell.id === "gaps")!;
    expect(gaps.value).toBe("0");
    expect(gaps.active).toBe(true);
    gaps.onSelect!();
    expect(onChange).toHaveBeenLastCalledWith("all");
  });

  it("has no Drift cell unless asked for one", () => {
    const cells = machineSummaryCells(inventory, variants, "all", vi.fn());
    expect(cells.map((cell) => cell.id)).toEqual(["rows", "gaps", "differs", "detected"]);
  });

  it("shows — before Drift has scanned, never an ellipsis, and stays selectable", () => {
    const onSelect = vi.fn();
    const cells = machineSummaryCells(inventory, variants, "all", vi.fn(), {
      active: false,
      count: null,
      onSelect,
    });
    expect(cells.map((cell) => cell.id)).toEqual(["rows", "gaps", "differs", "drift", "detected"]);
    const drift = cells.find((cell) => cell.id === "drift")!;
    expect(drift.label).toBe("Drift vs harness.yaml");
    expect(drift.value).toBe("—");
    expect(drift.valueLabel).toBe("not scanned");
    expect(drift.tone).toBe("default");
    expect(drift.active).toBe(false);
    drift.onSelect!();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows Drift's count, warning above zero, pressed while the view shows", () => {
    const withCount = (count: number, active: boolean) =>
      machineSummaryCells(inventory, variants, "all", vi.fn(), { active, count, onSelect: vi.fn() }).find(
        (cell) => cell.id === "drift",
      )!;
    expect(withCount(3, true)).toMatchObject({ value: "3", tone: "warning", active: true, valueLabel: undefined });
    // Zero is still a way into Drift: acknowledged items and the conflict
    // ledger live there.
    const zero = withCount(0, false);
    expect(zero).toMatchObject({ value: "0", tone: "default", active: false });
    expect(zero.onSelect).toBeDefined();
  });
});
