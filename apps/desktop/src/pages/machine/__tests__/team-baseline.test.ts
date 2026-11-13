import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GridRow, HarnessConfig } from "@harness-kit/core";
import { MACHINE_FIXTURE_INVENTORY } from "../../__fixtures__/machine-fixture-data";
import { readHarnessSource } from "../../../lib/harness-source";
import {
  baselineCompileCommand,
  buildTeamBaselineView,
  readTeamBaseline,
  withSyntheticRows,
} from "../team-baseline";

vi.mock("../../../lib/harness-source", () => ({ readHarnessSource: vi.fn() }));

const YAML = `version: 2
metadata:
  name: team
  description: team baseline
mcp-servers:
  github:
    command: gh
`;

describe("readTeamBaseline", () => {
  beforeEach(() => {
    vi.mocked(readHarnessSource).mockReset();
  });

  it("is none without a project, and does not read", async () => {
    expect(await readTeamBaseline(null)).toEqual({ status: "none" });
    expect(readHarnessSource).not.toHaveBeenCalled();
  });

  it("is none when the project has no harness.yaml", async () => {
    vi.mocked(readHarnessSource).mockResolvedValue({ found: false, content: null, path: "/r/harness.yaml" });
    expect(await readTeamBaseline("/r")).toEqual({ status: "none" });
  });

  it("parses a present harness.yaml", async () => {
    vi.mocked(readHarnessSource).mockResolvedValue({ found: true, content: YAML, path: "/r/harness.yaml" });
    const state = await readTeamBaseline("/r");
    expect(state.status).toBe("ready");
  });

  it("reports a read failure as unavailable instead of throwing", async () => {
    vi.mocked(readHarnessSource).mockRejectedValue(new Error("no access"));
    const state = await readTeamBaseline("/r");
    expect(state).toEqual({ status: "unavailable", message: "no access" });
  });

  it("reports an unparseable file as unavailable", async () => {
    vi.mocked(readHarnessSource).mockResolvedValue({ found: true, content: "key: [unclosed\n", path: "/r/harness.yaml" });
    const state = await readTeamBaseline("/r");
    expect(state.status).toBe("unavailable");
  });
});

describe("buildTeamBaselineView", () => {
  const config = {
    version: "2",
    mcp: { servers: {} },
    "mcp-servers": { github: { command: "gh" }, "internal-db": { command: "db" } },
  } as unknown as HarnessConfig;

  it("marks a declared resource the machine has as required, and one it lacks as missing here", () => {
    const view = buildTeamBaselineView(MACHINE_FIXTURE_INVENTORY, config);
    expect(view.cells.get("mcp-server:github")).toBe("required");
    expect(view.cells.get("mcp-server:internal-db")).toBe("missing-here");
    expect(view.cells.has("skill:code-review")).toBe(false);
  });

  it("builds a synthetic row with every surface cell absent", () => {
    const view = buildTeamBaselineView(MACHINE_FIXTURE_INVENTORY, config);
    expect(view.syntheticRows).toHaveLength(1);
    const [row] = view.syntheticRows;
    expect(row).toMatchObject({ key: "mcp-server:internal-db", kind: "mcp-server", name: "internal-db" });
    expect(Object.keys(row.cells).sort()).toEqual(MACHINE_FIXTURE_INVENTORY.surfaces.map((s) => s.id).sort());
    expect(Object.values(row.cells).every((cell) => cell.status === "absent" && cell.entries.length === 0)).toBe(true);
  });
});

describe("withSyntheticRows", () => {
  const row = (key: string, kind: GridRow["kind"]) => ({ key, kind, name: key, cells: {} }) as unknown as GridRow;

  it("inserts after the last row of the same kind and appends a new kind", () => {
    const rows = [row("a", "plugin"), row("b", "skill"), row("c", "skill"), row("d", "instructions")];
    const result = withSyntheticRows(rows, [row("x", "skill"), row("y", "mcp-server")]);
    expect(result.map((r) => r.key)).toEqual(["a", "b", "c", "x", "d", "y"]);
  });

  it("returns the same rows when there is nothing to add", () => {
    const rows = [row("a", "plugin")];
    expect(withSyntheticRows(rows, [])).toBe(rows);
  });
});

describe("baselineCompileCommand", () => {
  const cli = "npx -p @harnessprotocol/cli harness-kit";

  it("goes to the project root, installs the plugins, then compiles", () => {
    expect(baselineCompileCommand("/work/app/")).toBe(
      `cd /work/app && ${cli} install harness.yaml && ${cli} compile harness.yaml`,
    );
  });

  it("quotes a path with spaces", () => {
    expect(baselineCompileCommand("/work/my app")).toBe(
      `cd '/work/my app' && ${cli} install harness.yaml && ${cli} compile harness.yaml`,
    );
  });

  it("escapes an embedded single quote", () => {
    expect(baselineCompileCommand("/work/it's")).toBe(
      `cd '/work/it'\\''s' && ${cli} install harness.yaml && ${cli} compile harness.yaml`,
    );
  });
});
