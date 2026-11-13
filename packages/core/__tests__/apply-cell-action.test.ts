import { describe, expect, it } from "vitest";
import { applyCellAction, CellActionError } from "../src/write/apply-cell-action.js";
import { planCellAction } from "../src/write/plan-cell-action.js";
import { buildMachineInventory } from "../src/observe/machine-inventory.js";
import { createHomeTransactionRoot } from "../src/surfaces/write-scope.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const OPTS = { projectRoot: null, homeRoot: "/home/user", platform: "darwin" as const };

function machine(extra: Record<string, string> = {}): MockFsProvider {
  return new MockFsProvider({
    "/home/user/.claude.json": JSON.stringify({
      mcpServers: { postgres: { type: "stdio", command: "pg-mcp", args: ["--local"] } },
    }),
    "/home/user/.cursor/mcp.json": JSON.stringify({ mcpServers: {} }),
    ...extra,
  });
}

const context = (fs: MockFsProvider, timestamp = "apply") => ({
  fs,
  timestamp,
  roots: { home: createHomeTransactionRoot("/home/user", "darwin" as const) },
});

async function plan(fs: MockFsProvider, to: "cursor" | "pi" = "cursor") {
  return planCellAction(
    fs,
    { kind: "mcp-server", name: "postgres", from: "claude-code", to, scope: "user" },
    OPTS,
  );
}

describe("cell action apply gate (AC-34, AC-17)", () => {
  it("applies a lossless action without confirmation", async () => {
    const fs = machine();
    const result = await applyCellAction(await plan(fs), context(fs), { homeRoot: "/home/user" });
    expect(result.committed).toBe(true);
    expect(JSON.parse(fs.getFile("/home/user/.cursor/mcp.json")!).mcpServers.postgres).toBeDefined();
  });

  it("reports loss on the plan when the target cannot fully express the resource", async () => {
    const lossy = await plan(machine(), "pi");
    // pi has no MCP concept — the plan must say so rather than pretending.
    expect(lossy.supported).toBe(false);
    expect(lossy.loss?.losses.length ?? 0).toBeGreaterThan(0);
  });

  it("refuses to apply an unsupported plan", async () => {
    const fs = machine();
    await expect(
      applyCellAction(await plan(fs, "pi"), context(fs), { homeRoot: "/home/user" }),
    ).rejects.toThrow(CellActionError);
  });

  it("does not demand confirmation for a mere shape translation", async () => {
    // cursor x mcp-server is "translated" in the matrix — the resource IS
    // expressed, just in the native shape. Gating on that would put a
    // confirmation in front of nearly every copy.
    const translated = await plan(machine());
    expect(translated.loss?.losses[0]?.capability).toBe("translated");
    expect(translated.requiresConfirmation).toBe(false);
  });

  it("mutates nothing when a lossy plan is not confirmed", async () => {
    const fs = machine();
    const lossyPlan = { ...(await plan(fs)), requiresConfirmation: true };
    const before = fs.getFile("/home/user/.cursor/mcp.json");
    const error = await applyCellAction(lossyPlan, context(fs), {
      homeRoot: "/home/user",
    }).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(CellActionError);
    expect((error as CellActionError).code).toBe("loss-unconfirmed");
    expect(fs.getFile("/home/user/.cursor/mcp.json")).toBe(before);
  });

  it("applies a lossy plan once confirmed", async () => {
    const fs = machine();
    const lossyPlan = { ...(await plan(fs)), requiresConfirmation: true };
    const result = await applyCellAction(lossyPlan, context(fs), {
      homeRoot: "/home/user",
      confirmed: true,
    });
    expect(result.committed).toBe(true);
  });

  it("surfaces an outside edit as a conflict, not a raw precondition error", async () => {
    const fs = machine();
    const staged = await plan(fs);
    // Someone edits the target between preview and apply.
    await fs.writeFile("/home/user/.cursor/mcp.json", JSON.stringify({ mcpServers: { other: {} } }));

    const error = await applyCellAction(staged, context(fs), { homeRoot: "/home/user" }).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(CellActionError);
    expect((error as CellActionError).code).toBe("user-modified-outside");
    expect((error as CellActionError).message).toContain(".cursor/mcp.json");
    // The outside edit survives — we never clobbered it.
    expect(JSON.parse(fs.getFile("/home/user/.cursor/mcp.json")!).mcpServers.other).toBeDefined();
  });

  it("is a no-op when the target already matches", async () => {
    const fs = machine();
    await applyCellAction(await plan(fs), context(fs), { homeRoot: "/home/user" });
    const second = await plan(fs);
    expect(second.noop).toBe(true);
    const result = await applyCellAction(second, context(fs, "second"), { homeRoot: "/home/user" });
    expect(result.committed).toBe(true);
    expect(result.written).toEqual([]);
  });

  it("rebases absolute plan paths onto the home root", async () => {
    const fs = machine();
    const result = await applyCellAction(await plan(fs), context(fs), { homeRoot: "/home/user" });
    // Written paths are root-relative, and the backup lands in the home root.
    expect(result.written).toEqual([".cursor/mcp.json"]);
    expect(fs.getFile("/home/user/.harness/backups/apply/.cursor/mcp.json")).toBeDefined();
  });
});

describe("instructions copy leaves no gap on rescan (AC-57)", () => {
  const instructionsMachine = () =>
    new MockFsProvider({
      "/home/user/.claude/CLAUDE.md": "# House rules\n\nBe kind.\n",
      "/home/user/.codex/config.toml": 'model = "gpt-5"\n',
    });

  it("an applied copy of User instructions into Codex's AGENTS.md closes the gap", async () => {
    const fs = instructionsMachine();
    const before = await buildMachineInventory(fs, OPTS);
    const gap = before.gaps.find((g) => g.row === "instructions:user instructions");
    expect(gap?.missingOn).toContain("codex");

    const planned = await planCellAction(
      fs,
      { kind: "instructions", name: "User instructions", from: "claude-code", to: "codex", scope: "user" },
      OPTS,
    );
    expect(planned.supported).toBe(true);
    const result = await applyCellAction(planned, context(fs), { homeRoot: "/home/user" });
    expect(result.committed).toBe(true);
    // What lands is a harness:sync marker block, not a file copy.
    expect(fs.getFile("/home/user/.codex/AGENTS.md")).toContain("<!-- BEGIN harness:sync:");

    const after = await buildMachineInventory(fs, OPTS);
    const row = after.rows.find((r) => r.key === "instructions:user instructions")!;
    expect(row.cells.codex.status).toBe("present");
    expect(after.gaps.find((g) => g.row === "instructions:user instructions")).toBeUndefined();
  });

  const copy = async (
    fs: MockFsProvider,
    from: "claude-code" | "codex",
    to: "claude-code" | "codex",
    stamp: string,
  ) => {
    const planned = await planCellAction(
      fs,
      { kind: "instructions", name: "User instructions", from, to, scope: "user" },
      OPTS,
    );
    const result = await applyCellAction(planned, context(fs, stamp), { homeRoot: "/home/user" });
    return { planned, result };
  };
  const userRow = async (fs: MockFsProvider) =>
    (await buildMachineInventory(fs, OPTS)).rows.find((r) => r.key === "instructions:user instructions")!;
  const sync = (text: string) => (text.match(/BEGIN harness:sync/g) ?? []).length;

  it("copy into an empty target rescans as the same content, and a repeat is a no-op", async () => {
    const fs = instructionsMachine();
    await copy(fs, "claude-code", "codex", "a");
    const row = await userRow(fs);
    expect(row.cells.codex.status).toBe("present");
    expect(row.cells.codex.effectiveDigest).toBe(row.cells["claude-code"].effectiveDigest);
    expect((await buildMachineInventory(fs, OPTS)).diffs).toEqual([]);
    const again = await copy(fs, "claude-code", "codex", "b");
    expect(again.planned.noop).toBe(true);
  });

  it("copy into a target with its own prose keeps the prose and rescans as the same", async () => {
    const fs = new MockFsProvider({
      ...instructionsMachine().getAllFiles(),
      "/home/user/.codex/AGENTS.md": "# Codex notes\n\nMine.\n",
    });
    await copy(fs, "claude-code", "codex", "a");
    const text = fs.getFile("/home/user/.codex/AGENTS.md")!;
    expect(text).toContain("Mine.");
    expect(text).toContain("BEGIN harness:sync:user-instructions");
    const row = await userRow(fs);
    expect(row.cells.codex.effectiveDigest).toBe(row.cells["claude-code"].effectiveDigest);
    expect((await copy(fs, "claude-code", "codex", "b")).planned.noop).toBe(true);
  });

  it("copying back and forth never nests blocks", async () => {
    const fs = new MockFsProvider({
      ...instructionsMachine().getAllFiles(),
      "/home/user/.codex/AGENTS.md": "# Beta\n",
    });
    await copy(fs, "claude-code", "codex", "a");
    // Claude's own text changes; the codex copy is now the older one.
    const edited = new MockFsProvider({
      ...fs.getAllFiles(),
      "/home/user/.claude/CLAUDE.md": "# Alpha two\n",
    });
    await copy(edited, "codex", "claude-code", "b");
    expect(sync(edited.getFile("/home/user/.claude/CLAUDE.md")!)).toBe(1);
    await copy(edited, "claude-code", "codex", "c");
    const codex = edited.getFile("/home/user/.codex/AGENTS.md")!;
    expect(sync(codex)).toBe(1);
    expect(codex).toContain("# Beta");
    expect(codex.match(/END harness:sync/g)).toHaveLength(1);
  });

  it("refuses a Project instructions row requested at user scope instead of writing the user file", async () => {
    const fs = new MockFsProvider({
      "/home/user/.codex/config.toml": 'model = "gpt-5"\n',
      "/project/CLAUDE.md": "# Project only\n",
    });
    const planned = await planCellAction(
      fs,
      { kind: "instructions", name: "Project instructions", from: "claude-code", to: "codex", scope: "user" },
      { ...OPTS, projectRoot: "/project" },
    );
    expect(planned.supported).toBe(false);
    expect(planned.changes).toEqual([]);
  });
});
