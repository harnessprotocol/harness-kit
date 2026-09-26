import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { GridRow, MachineGap, SurfaceId } from "@harness-kit/core";
import { RowDrawer } from "../RowDrawer";
import { applyCellActionViaTauri, buildCellAction } from "../cell-actions";

// The selectors (presentSources, missingTargets, divergentTargets) stay real;
// only planning through core's engine and the Tauri write are replaced.
vi.mock("../cell-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cell-actions")>()),
  buildCellAction: vi.fn(
    async (row: { key: string; kind: string; name: string }, from: string, to: string) => ({
      request: { kind: row.kind, name: row.name, from, to, scope: "user" },
      plan: { supported: true, noop: false, requiresConfirmation: false, changes: [] },
      cli: `harness-kit sync --from ${from} --to ${to}`,
      prompt: `Install ${row.kind} ${row.name} on ${to}.`,
    }),
  ),
  applyCellActionViaTauri: vi.fn(async () => ({ written: [] })),
}));

const SURFACE_ORDER: SurfaceId[] = ["claude-code", "codex", "cursor", "gemini"];

function present(digest: string) {
  return {
    status: "present" as const,
    effectiveDigest: digest,
    entries: [{ scope: "user" as const, digest, provenance: { file: "/f", formatId: "x" } }],
  };
}

/**
 * claude-code, the FIRST present surface in registry order, is the odd one
 * out: codex and cursor share the baseline digest.
 */
function makeRow(): GridRow {
  return {
    key: "mcp-server:postgres",
    kind: "mcp-server",
    name: "postgres",
    cells: {
      "claude-code": present("sha256:xxxx"),
      codex: present("sha256:yyyy"),
      cursor: present("sha256:yyyy"),
      gemini: { status: "absent", entries: [] },
    },
  } as unknown as GridRow;
}

const GEMINI_GAP: MachineGap[] = [
  { row: "mcp-server:postgres", presentOn: ["claude-code", "codex", "cursor"], missingOn: ["gemini"] },
] as unknown as MachineGap[];

function renderDrawer(gaps: MachineGap[] = []) {
  return render(
    <RowDrawer row={makeRow()} diffs={[]} gaps={gaps} surfaceOrder={SURFACE_ORDER} onClose={vi.fn()} />,
  );
}

function sourceSelect() {
  return screen.getByLabelText("From") as HTMLSelectElement;
}

function targetSelect() {
  return screen.getByLabelText("To") as HTMLSelectElement;
}

function groupValues(label: string): string[] {
  const group = targetSelect().querySelector(`optgroup[label="${label}"]`);
  expect(group).not.toBeNull();
  return Array.from(group!.querySelectorAll("option")).map((option) => option.value);
}

function lastPlan(): [string, string] {
  const call = vi.mocked(buildCellAction).mock.calls.at(-1)!;
  return [call[1], call[2]];
}

describe("RowDrawer from → to (AC-15)", () => {
  beforeEach(() => {
    vi.mocked(buildCellAction).mockClear();
  });

  it("defaults the source to the effective-digest winner, not the first present surface", async () => {
    renderDrawer();
    expect(sourceSelect().value).toBe("codex");
    expect(sourceSelect()).toBeEnabled();
    await waitFor(() => expect(lastPlan()).toEqual(["codex", "claude-code"]));
  });

  it("defaults the target to the first closable gap, listed before the divergent copies", async () => {
    renderDrawer(GEMINI_GAP);
    expect(targetSelect().value).toBe("gemini");
    expect(groupValues("Missing")).toEqual(["gemini"]);
    expect(groupValues("Has a different version")).toEqual(["claude-code"]);
    await waitFor(() => expect(lastPlan()).toEqual(["codex", "gemini"]));
  });

  it("rebuilds the plan and the target list when the source changes", async () => {
    renderDrawer();
    await waitFor(() => expect(lastPlan()).toEqual(["codex", "claude-code"]));
    const options = () => Array.from(targetSelect().options).map((option) => option.value);
    expect(options()).toEqual(["claude-code"]);

    fireEvent.change(sourceSelect(), { target: { value: "claude-code" } });

    expect(sourceSelect().value).toBe("claude-code");
    // From claude-code, codex and cursor are the ones that differ. The old
    // target (claude-code itself) is no longer valid, so the default returns.
    expect(options()).toEqual(["codex", "cursor"]);
    expect(targetSelect().value).toBe("codex");
    await waitFor(() => expect(lastPlan()).toEqual(["claude-code", "codex"]));
  });

  it("keeps a single source visible but disabled", () => {
    const row = makeRow();
    row.cells = {
      "claude-code": present("sha256:xxxx"),
      gemini: { status: "absent", entries: [] },
    } as unknown as GridRow["cells"];
    render(
      <RowDrawer row={row} diffs={[]} gaps={GEMINI_GAP} surfaceOrder={SURFACE_ORDER} onClose={vi.fn()} />,
    );
    const drawer = screen.getByTestId("machine-row-drawer");
    expect(within(drawer).getByLabelText("From")).toBeDisabled();
    expect(sourceSelect().value).toBe("claude-code");
    expect(targetSelect().value).toBe("gemini");
  });
});

describe("RowDrawer apply never runs a stale plan", () => {
  beforeEach(() => {
    vi.mocked(buildCellAction).mockClear();
    vi.mocked(applyCellActionViaTauri).mockClear();
  });

  it("disables Apply while the plan for a new source is still being built", async () => {
    renderDrawer();
    const apply = screen.getByRole("button", { name: "Apply" });
    await waitFor(() => expect(apply).toBeEnabled());

    // Planning the new pair hangs, as core's file I/O can.
    vi.mocked(buildCellAction).mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.change(sourceSelect(), { target: { value: "claude-code" } });

    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(applyCellActionViaTauri).not.toHaveBeenCalled();
  });

  it("spends the plan on a successful apply, so a second click cannot write again", async () => {
    const onApplied = vi.fn();
    render(
      <RowDrawer
        row={makeRow()}
        diffs={[]}
        gaps={GEMINI_GAP}
        surfaceOrder={SURFACE_ORDER}
        onClose={vi.fn()}
        onApplied={onApplied}
      />,
    );
    const apply = screen.getByRole("button", { name: "Apply" });
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));

    // The page's rescan has not replaced the row yet (or failed and never
    // will): Apply is off, but the CLI command is still there to copy.
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(applyCellActionViaTauri).toHaveBeenCalledTimes(1);
    expect(screen.getByText("harness-kit sync --from codex --to gemini")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy CLI command" })).toBeEnabled();
  });
});
