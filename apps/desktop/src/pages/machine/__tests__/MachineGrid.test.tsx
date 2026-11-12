import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MACHINE_FIXTURE_INVENTORY } from "../../__fixtures__/machine-fixture-data";
import { MachineGrid } from "../MachineGrid";
import { CELL_VARIANTS, LEGEND_VARIANTS } from "../cell-state";
import { surfaceLabel } from "../../../lib/surface-labels";

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
    // copilot-cli is not installed, so its column is hidden until asked for.
    fireEvent.click(screen.getByRole("button", { name: /^Show all/ }));
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

describe("MachineGrid cell clicks (AC-57)", () => {
  it("passes the clicked cell's surface to onRowClick", () => {
    const onRowClick = vi.fn();
    render(<MachineGrid inventory={MACHINE_FIXTURE_INVENTORY} selectedRowKey={null} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByTestId("cell-mcp-server:github-gemini"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0].key).toBe("mcp-server:github");
    expect(onRowClick.mock.calls[0][1]).toBe("gemini");
  });

  it("opens with no target when the row's name is clicked", () => {
    const onRowClick = vi.fn();
    render(<MachineGrid inventory={MACHINE_FIXTURE_INVENTORY} selectedRowKey={null} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText("github"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][1]).toBeUndefined();
  });
});

describe("MachineGrid instructions row (AC-57)", () => {
  const instructionsRow = MACHINE_FIXTURE_INVENTORY.rows.find((row) => row.kind === "instructions")!;

  it("shows instructions as one 'User instructions' row, not one per file", () => {
    renderGrid();
    expect(MACHINE_FIXTURE_INVENTORY.rows.filter((row) => row.kind === "instructions")).toHaveLength(1);
    expect(screen.getByText("User instructions")).toBeInTheDocument();
    expect(screen.queryByText("CLAUDE.md")).toBeNull();
  });

  it("a copied-to cell is present, and no '+ copy' chip is left on the row", () => {
    const copied = {
      ...MACHINE_FIXTURE_INVENTORY,
      rows: MACHINE_FIXTURE_INVENTORY.rows.map((row) =>
        row.key === instructionsRow.key
          ? {
              ...row,
              cells: {
                ...row.cells,
                codex: {
                  status: "present" as const,
                  effectiveDigest: "sha256:0000000000",
                  entries: [
                    {
                      scope: "user" as const,
                      digest: "sha256:0000000000",
                      provenance: { file: "~/.codex/AGENTS.md", formatId: "markdown-instructions" as const },
                    },
                  ],
                },
              },
            }
          : row,
      ),
    };
    render(<MachineGrid inventory={copied} selectedRowKey={null} onRowClick={vi.fn()} />);
    const cell = screen.getByTestId(`cell-${instructionsRow.key}-codex`);
    expect(cell).toHaveAttribute("data-status", "present");
    expect(cell).not.toHaveTextContent("+ copy");
  });
});

describe("MachineGrid column labels at narrow widths (2c.12)", () => {
  it("truncates a surface label with an ellipsis and keeps the full name in a tooltip", () => {
    renderGrid();
    const header = screen.getByTestId("surface-col-claude-code");
    expect(header).toHaveAttribute("title", surfaceLabel("claude-code"));
    const label = screen.getByTestId("surface-label-claude-code");
    expect(label.style.textOverflow).toBe("ellipsis");
    expect(label.style.overflow).toBe("hidden");
    expect(screen.getByTestId("machine-grid").style.tableLayout).toBe("fixed");
  });
});

describe("MachineGrid not-installed surfaces (AC-59)", () => {
  const total = MACHINE_FIXTURE_INVENTORY.surfaces.length;
  const hidden = MACHINE_FIXTURE_INVENTORY.surfaces.filter((s) => !s.detected).map((s) => s.id);

  it("hides undetected surfaces by default, cells and headers alike", () => {
    renderGrid();
    expect(hidden.length).toBeGreaterThan(0);
    for (const id of hidden) {
      expect(screen.queryByTestId(`surface-col-${id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`cell-mcp-server:github-${id}`)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId("surface-col-claude-code")).toBeInTheDocument();
  });

  it("'Show all N' reveals them, annotated, and 'Hide not installed' puts them back", () => {
    renderGrid();
    fireEvent.click(screen.getByRole("button", { name: `Show all ${total}` }));
    for (const id of hidden) {
      expect(within(screen.getByTestId(`surface-col-${id}`)).getByText("not installed")).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Hide not installed" }));
    expect(screen.queryByTestId(`surface-col-${hidden[0]}`)).not.toBeInTheDocument();
  });

  it("offers no control when every surface is installed", () => {
    const inventory = {
      ...MACHINE_FIXTURE_INVENTORY,
      surfaces: MACHINE_FIXTURE_INVENTORY.surfaces.map((s) => ({ ...s, detected: true })),
    };
    render(<MachineGrid inventory={inventory} selectedRowKey={null} onRowClick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });

  it("shows every column when nothing is installed, rather than an empty grid", () => {
    const inventory = {
      ...MACHINE_FIXTURE_INVENTORY,
      surfaces: MACHINE_FIXTURE_INVENTORY.surfaces.map((s) => ({ ...s, detected: false })),
    };
    render(<MachineGrid inventory={inventory} selectedRowKey={null} onRowClick={vi.fn()} />);
    expect(screen.getByTestId("surface-col-claude-code")).toBeInTheDocument();
  });
});
