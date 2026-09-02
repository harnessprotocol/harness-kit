import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The wiring test the plan promised and the first pass skipped: every layer
 * was covered in isolation (core's ledger function, the bridge class, the Rust
 * command) and NOTHING executed applyCellActionViaTauri — so deleting the
 * whole recording block would have failed zero tests.
 */
const invoke = vi.hoisted(() => vi.fn());
const homeDir = vi.hoisted(() => vi.fn(async () => "/home/user"));
const applyCellAction = vi.hoisted(() => vi.fn() as unknown as ReturnType<typeof vi.fn> & ((...args: unknown[]) => unknown));
const recordAppliedTransaction = vi.hoisted(
  () =>
    vi.fn(
      async (..._args: unknown[]): Promise<{ recorded: boolean; error?: string }> => ({
        recorded: true,
      }),
    ),
);

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir }));
vi.mock("@harness-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@harness-kit/core")>();
  return { ...actual, applyCellAction, recordAppliedTransaction };
});

const { applyCellActionViaTauri } = await import("../cell-actions");

function view(changePath = "/home/user/.cursor/mcp.json") {
  return {
    request: {
      kind: "mcp-server" as const,
      name: "Postgres",
      from: "claude-code" as const,
      to: "cursor" as const,
      scope: "user" as const,
    },
    plan: {
      supported: true,
      changes: [{ path: changePath, before: "{}", after: '{"a":1}' }],
      noop: false,
      carriesSecret: false,
      loss: null,
      requiresConfirmation: false,
    },
    cli: "harness-kit sync ...",
    prompt: "...",
  } as never;
}

describe("applyCellActionViaTauri records a rollback point", () => {
  beforeEach(() => {
    invoke.mockReset();
    applyCellAction.mockReset();
    recordAppliedTransaction.mockClear();
    applyCellAction.mockResolvedValue({
      committed: true,
      written: [".cursor/mcp.json"],
      removed: [],
      rolledBack: [],
      backupDir: ".harness/backups/ts",
      manifestPath: ".harness/backups/ts/transaction.json",
    });
  });

  it("records the apply, with home-derived roots and manifest root", async () => {
    await applyCellActionViaTauri(view(), true);

    expect(recordAppliedTransaction).toHaveBeenCalledTimes(1);
    const [, changes, input] = recordAppliedTransaction.mock.calls[0] as unknown as [
      unknown,
      Array<{ root: string; path: string; before: string | null; after: string | null }>,
      { manifestRoot: string; surfaces: string[]; identityKeys: string[] },
    ];
    // roots is derived from these — an empty array here is the M2 bug.
    expect(changes).toEqual([
      { root: "home", path: ".cursor/mcp.json", before: "{}", after: '{"a":1}' },
    ]);
    expect(input.manifestRoot).toBe("/home/user");
    expect(input.surfaces).toEqual(["cursor"]);
    expect(input.identityKeys).toEqual(["mcp-server:postgres"]);
  });

  it("returns the ledger failure instead of only logging it", async () => {
    recordAppliedTransaction.mockResolvedValueOnce({
      recorded: false,
      error: "database is locked",
    });
    const applied = await applyCellActionViaTauri(view(), true);
    expect(applied.ledgerError).toContain("database is locked");
    // The write itself still succeeded — degrade, don't fail.
    expect(applied.written).toEqual([".cursor/mcp.json"]);
  });

  it("does not record a no-op apply", async () => {
    const empty = view();
    (empty as { plan: { changes: unknown[] } }).plan.changes = [];
    await applyCellActionViaTauri(empty, true);
    expect(recordAppliedTransaction).not.toHaveBeenCalled();
  });

  it("refuses to record a change outside the home root", async () => {
    // The ledger hardcodes root "home"; a path outside it must fail loudly
    // rather than be recorded under a root it does not belong to.
    await expect(applyCellActionViaTauri(view("/etc/passwd"), true)).rejects.toThrow(
      /outside the home root/,
    );
  });

  it("passes the loss acknowledgement through rather than forcing true", async () => {
    await applyCellActionViaTauri(view(), false);
    const call = applyCellAction.mock.calls[0] as unknown as unknown[];
    expect(call[2]).toMatchObject({ confirmed: false });
  });
});
