import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import TerminalGrid from "../TerminalGrid";

describe("TerminalGrid", () => {
  function renderGrid(count: number, childCount?: number) {
    const n = childCount ?? count;
    return render(
      <TerminalGrid count={count}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} data-testid={`cell-${i}`}>Cell {i}</div>
        ))}
      </TerminalGrid>,
    );
  }

  function getGrid(container: HTMLElement): HTMLElement {
    return container.firstElementChild as HTMLElement;
  }

  function getColumns(container: HTMLElement): string {
    return getGrid(container).style.gridTemplateColumns;
  }

  // ── Column layout rules (matching Auto-Claude) ─────────────

  it("uses 1 column for 0 terminals", () => {
    const { container } = renderGrid(0, 0);
    expect(getColumns(container)).toBe("repeat(1, 1fr)");
  });

  it("uses 1 column for 1 terminal", () => {
    const { container } = renderGrid(1);
    expect(getColumns(container)).toBe("repeat(1, 1fr)");
  });

  it("uses 2 columns for 2 terminals", () => {
    const { container } = renderGrid(2);
    expect(getColumns(container)).toBe("repeat(2, 1fr)");
  });

  it("uses 3 columns for 3 terminals", () => {
    const { container } = renderGrid(3);
    expect(getColumns(container)).toBe("repeat(3, 1fr)");
  });

  it("uses 2 columns for 4 terminals (2x2 grid)", () => {
    const { container } = renderGrid(4);
    expect(getColumns(container)).toBe("repeat(2, 1fr)");
  });

  it("uses 3 columns for 5 terminals", () => {
    const { container } = renderGrid(5);
    expect(getColumns(container)).toBe("repeat(3, 1fr)");
  });

  it("uses 3 columns for 6 terminals", () => {
    const { container } = renderGrid(6);
    expect(getColumns(container)).toBe("repeat(3, 1fr)");
  });

  it("uses 3 columns for 9 terminals", () => {
    const { container } = renderGrid(9);
    expect(getColumns(container)).toBe("repeat(3, 1fr)");
  });

  it("uses 4 columns for 10 terminals", () => {
    const { container } = renderGrid(10);
    expect(getColumns(container)).toBe("repeat(4, 1fr)");
  });

  it("uses 4 columns for 12 terminals", () => {
    const { container } = renderGrid(12);
    expect(getColumns(container)).toBe("repeat(4, 1fr)");
  });

  // ── Rendering ──────────────────────────────────────────────

  it("renders all children", () => {
    renderGrid(3);
    expect(screen.getByTestId("cell-0")).toBeInTheDocument();
    expect(screen.getByTestId("cell-1")).toBeInTheDocument();
    expect(screen.getByTestId("cell-2")).toBeInTheDocument();
  });

  it("applies grid display", () => {
    const { container } = renderGrid(2);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.display).toBe("grid");
  });

  it("sets 1px gap between panels", () => {
    const { container } = renderGrid(2);
    expect(getGrid(container).style.gap).toBe("1px");
  });

  // ── Row layout ─────────────────────────────────────────────

  it("sets correct row count for 4 terminals (2x2)", () => {
    const { container } = renderGrid(4);
    expect(getGrid(container).style.gridTemplateRows).toBe("repeat(2, 1fr)");
  });

  it("sets correct row count for 5 terminals (3 cols → 2 rows)", () => {
    const { container } = renderGrid(5);
    expect(getGrid(container).style.gridTemplateRows).toBe("repeat(2, 1fr)");
  });

  it("sets correct row count for 9 terminals (3 cols → 3 rows)", () => {
    const { container } = renderGrid(9);
    expect(getGrid(container).style.gridTemplateRows).toBe("repeat(3, 1fr)");
  });
});
