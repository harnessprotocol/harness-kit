import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ChangesList } from "../ChangesList";
import type { ChangeEntry } from "../../../lib/tauri";

const mockListChanges = vi.fn();
const mockUndoChange = vi.fn();

vi.mock("../../../lib/tauri", () => ({
  listChanges: (...args: unknown[]) => mockListChanges(...args),
  undoChange: (...args: unknown[]) => mockUndoChange(...args),
}));

function change(overrides: Partial<ChangeEntry> = {}): ChangeEntry {
  return {
    transactionId: "tx-1",
    appliedAt: "2026-11-02T10:00:00.000Z",
    surfaces: ["codex"],
    kinds: ["mcp-server"],
    identityKeys: ["mcp-server:github"],
    files: [".codex/config.toml"],
    copiedFrom: "claude-code",
    status: "applied",
    undoable: true,
    reason: null,
    ...overrides,
  };
}

describe("ChangesList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListChanges.mockResolvedValue([]);
  });

  it("says so when nothing has changed yet", async () => {
    render(<ChangesList />);
    expect(await screen.findByText("No changes yet")).toBeInTheDocument();
  });

  it("lists what changed, where, which file and when, in the order Rust returned", async () => {
    mockListChanges.mockResolvedValue([
      change({ transactionId: "new", identityKeys: ["mcp-server:github"] }),
      change({
        transactionId: "old",
        appliedAt: "2026-11-01T10:00:00.000Z",
        identityKeys: ["mcp-server:postgres"],
        copiedFrom: null,
        files: [".claude.json"],
        surfaces: ["claude-code"],
      }),
    ]);
    render(<ChangesList />);

    const rows = await screen.findAllByTestId("change-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("MCP server github")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/Copied from Claude Code to Codex/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/~\/\.codex\/config\.toml/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText("MCP server postgres")).toBeInTheDocument();
    expect(within(rows[1]!).queryByText(/Copied from/)).not.toBeInTheDocument();
  });

  it("asks for the list with no arguments the webview could abuse", async () => {
    render(<ChangesList />);
    await screen.findByText("No changes yet");
    expect(mockListChanges).toHaveBeenCalledWith();
  });

  it("undoes a change after confirmation, sending only its id, and reloads the list", async () => {
    mockListChanges.mockResolvedValueOnce([change()]).mockResolvedValueOnce([
      change({ status: "undone", undoable: false, reason: "Already undone." }),
    ]);
    mockUndoChange.mockResolvedValue({ transactionId: "tx-1", files: [".codex/config.toml"], warning: null });
    render(<ChangesList />);

    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(mockUndoChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Undo this change" }));

    await waitFor(() => expect(mockUndoChange).toHaveBeenCalledWith("tx-1"));
    expect(await screen.findByRole("status")).toHaveTextContent("MCP server github was put back.");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument());
    expect(screen.getByText("Undone.")).toBeInTheDocument();
    expect(mockListChanges).toHaveBeenCalledTimes(2);
  });

  it("cancelling the confirmation undoes nothing", async () => {
    mockListChanges.mockResolvedValue([change()]);
    render(<ChangesList />);
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockUndoChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("shows the refusal on the row when the file changed since, and keeps Undo available", async () => {
    mockListChanges.mockResolvedValue([change()]);
    mockUndoChange.mockRejectedValue(
      "Refusing to write '.codex/config.toml': it changed on disk since it was read (expected a, found b)",
    );
    render(<ChangesList />);

    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo this change" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("changed on disk");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("offers no Undo on a change that cannot be undone, and says why", async () => {
    mockListChanges.mockResolvedValue([
      change({
        undoable: false,
        status: "unavailable",
        reason: "The backup for this change is no longer on disk.",
      }),
    ]);
    render(<ChangesList />);
    expect(await screen.findByText("The backup for this change is no longer on disk.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("shows a notice with Retry when the list cannot be read", async () => {
    mockListChanges.mockRejectedValueOnce("state database is locked").mockResolvedValueOnce([]);
    render(<ChangesList />);
    expect(await screen.findByText("Couldn't load the list of changes")).toBeInTheDocument();
    expect(screen.queryByText("No changes yet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No changes yet")).toBeInTheDocument();
  });

  it("passes a restore-but-not-marked warning on to the user", async () => {
    mockListChanges.mockResolvedValue([change()]);
    mockUndoChange.mockResolvedValue({
      transactionId: "tx-1",
      files: [],
      warning: "The files were restored, but the change could not be marked as undone: disk full",
    });
    render(<ChangesList />);
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo this change" }));
    expect(await screen.findByRole("status")).toHaveTextContent("could not be marked as undone");
  });
});
