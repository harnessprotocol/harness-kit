import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { GridRow, SurfaceId } from "@harness-kit/core";
import { RowDrawer } from "../RowDrawer";

vi.mock("../cell-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cell-actions")>()),
  buildCellAction: vi.fn(async () => ({
    request: {},
    plan: { supported: true, noop: false, requiresConfirmation: false, changes: [] },
    cli: "",
    prompt: "",
  })),
  applyCellActionViaTauri: vi.fn(async () => ({ written: [] })),
}));

const ORDER: SurfaceId[] = ["claude-code", "codex", "cursor", "gemini"];
const row = {
  key: "mcp-server:postgres",
  kind: "mcp-server",
  name: "postgres",
  cells: { "claude-code": { status: "absent", entries: [] } },
} as unknown as GridRow;

// AC-61: opening the drawer moves focus into it; closing returns it to the cell.
function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>cell</button>
      {open && <RowDrawer row={row} diffs={[]} gaps={[]} surfaceOrder={ORDER} onClose={() => setOpen(false)} />}
    </>
  );
}

describe("RowDrawer focus (AC-61)", () => {
  it("moves focus into the drawer on open", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: "cell" }));
    const drawer = screen.getByTestId("machine-row-drawer");
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
  });

  it("returns focus to the cell that opened it on Escape and on the close button", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const cell = screen.getByRole("button", { name: "cell" });
    await user.click(cell);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument());
    expect(cell).toHaveFocus();

    await user.click(cell);
    await user.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByTestId("machine-row-drawer")).not.toBeInTheDocument();
    expect(cell).toHaveFocus();
  });
});
