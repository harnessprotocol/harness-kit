import { describe, expect, it } from "vitest";
import { applyCellAction, CellActionError } from "../src/write/apply-cell-action.js";
import { planCellAction } from "../src/write/plan-cell-action.js";
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
