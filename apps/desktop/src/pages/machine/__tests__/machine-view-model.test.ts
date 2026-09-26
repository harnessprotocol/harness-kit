import { describe, expect, it, vi } from "vitest";
import { MACHINE_FIXTURE_INVENTORY } from "../../__fixtures__/machine-fixture-data";
import { inventoryVariants } from "../cell-state";
import { filterOf, filterRows, machineSummaryCells, withFilter } from "../machine-view-model";

const inventory = MACHINE_FIXTURE_INVENTORY;
const variants = inventoryVariants(inventory);

function rowsWith(variant: string): string[] {
  return inventory.rows
    .filter((row) => Object.values(variants.get(row.key) ?? {}).includes(variant as never))
    .map((row) => row.key);
}

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
    const next = withFilter(new URLSearchParams("drift=1&harness=cursor"), "gaps");
    expect(next.get("filter")).toBe("gaps");
    expect(next.get("drift")).toBe("1");
    expect(next.get("harness")).toBe("cursor");
  });

  it("removes the param for all, and does not mutate its input", () => {
    const current = new URLSearchParams("drift=1&filter=differs");
    const next = withFilter(current, "all");
    expect(next.has("filter")).toBe(false);
    expect(next.get("drift")).toBe("1");
    expect(current.get("filter")).toBe("differs");
  });
});

describe("filterRows", () => {
  it("keeps every row for all", () => {
    expect(filterRows(inventory.rows, variants, "all")).toBe(inventory.rows);
  });

  it("keeps rows with a gap chip for gaps, and rows with a differs chip for differs", () => {
    expect(filterRows(inventory.rows, variants, "gaps").map((row) => row.key)).toEqual(rowsWith("gap"));
    expect(filterRows(inventory.rows, variants, "differs").map((row) => row.key)).toEqual(
      rowsWith("differs"),
    );
  });
});

describe("machineSummaryCells", () => {
  it("counts rows, not pairwise diffs, and labels the cell Differs", () => {
    const cells = machineSummaryCells(inventory, variants, "all", vi.fn());
    const byId = Object.fromEntries(cells.map((cell) => [cell.id, cell]));
    expect(byId.gaps.value).toBe(String(rowsWith("gap").length));
    expect(byId.differs.label).toBe("Differs");
    expect(byId.differs.value).toBe(String(rowsWith("differs").length));
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
    const empty = { ...inventory, rows: inventory.rows.filter((row) => !rowsWith("gap").includes(row.key)), gaps: [] };
    const cells = machineSummaryCells(empty, inventoryVariants(empty), "all", vi.fn());
    const gaps = cells.find((cell) => cell.id === "gaps")!;
    expect(gaps.value).toBe("0");
    expect(gaps.onSelect).toBeUndefined();
  });
});
