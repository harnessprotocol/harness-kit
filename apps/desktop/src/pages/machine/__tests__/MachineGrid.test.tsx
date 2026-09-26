import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MACHINE_FIXTURE_INVENTORY } from "../../__fixtures__/machine-fixture-data";
import { MachineGrid } from "../MachineGrid";
import { CELL_VARIANTS, LEGEND_VARIANTS } from "../cell-state";

function renderGrid() {
  return render(
    <MachineGrid inventory={MACHINE_FIXTURE_INVENTORY} selectedRowKey={null} onRowClick={vi.fn()} />,
  );
}

function expectChip(testId: string, variant: string, text: string) {
  const cell = screen.getByTestId(testId);
  expect(cell).toHaveAttribute("data-variant", variant);
  const chip = cell.querySelector(".hk-cell");
  expect(chip).not.toBeNull();
  expect(chip).toHaveAttribute("data-variant", variant);
  expect(chip).toHaveTextContent(text);
}

describe("MachineGrid cell chips (AC-13)", () => {
  it("shows a closable gap as a '+ copy' chip", () => {
    renderGrid();
    expectChip("cell-mcp-server:github-gemini", "gap", "+ copy");
  });

  it("shows a copy that differs from the row baseline as a 'differs' chip", () => {
    renderGrid();
    expectChip("cell-mcp-server:github-codex", "differs", "differs");
  });

  it("labels present cells by winning scope", () => {
    renderGrid();
    expectChip("cell-mcp-server:github-cursor", "present-project", "project");
    expectChip("cell-mcp-server:github-claude-code", "present-user", "user");
  });

  it("keeps data-status on the cell alongside data-variant", () => {
    renderGrid();
    expect(screen.getByTestId("cell-mcp-server:github-gemini")).toHaveAttribute("data-status", "absent");
  });

  it("renders no chip in an absent cell that is not a gap", () => {
    renderGrid();
    // copilot-cli is absent on the github row but not in the gap's missingOn.
    const cell = screen.getByTestId("cell-mcp-server:github-copilot-cli");
    expect(cell).toHaveAttribute("data-variant", "absent");
    expect(cell.querySelector(".hk-cell")).toBeNull();
    expect(cell).toBeEmptyDOMElement();
  });
});

describe("MachineGrid legend (AC-13)", () => {
  it("names both surface-header badges", () => {
    renderGrid();
    const legend = screen.getByTestId("machine-grid-legend");
    expect(within(legend).getByText("entries skipped, see diagnostics")).toBeInTheDocument();
    expect(within(legend).getByText("plugin marketplaces registered")).toBeInTheDocument();
  });


  it("lists every legend variant's label exactly once, each with its chip", () => {
    renderGrid();
    const legend = screen.getByTestId("machine-grid-legend");
    for (const variant of LEGEND_VARIANTS) {
      const { chip, label } = CELL_VARIANTS[variant];
      expect(within(legend).getAllByText(label)).toHaveLength(1);
      const legendChip = legend.querySelector(`.hk-cell[data-variant="${variant}"]`);
      expect(legendChip).toHaveTextContent(chip ?? "");
    }
    expect(legend.querySelectorAll(".hk-cell")).toHaveLength(LEGEND_VARIANTS.length);
  });

  it("the fixture grid shows every legend variant at least once", () => {
    renderGrid();
    const grid = screen.getByTestId("machine-grid");
    for (const variant of LEGEND_VARIANTS) {
      expect(grid.querySelector(`td > .hk-cell[data-variant="${variant}"]`), variant).not.toBeNull();
    }
  });
});
