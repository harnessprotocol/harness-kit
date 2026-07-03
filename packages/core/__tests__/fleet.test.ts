import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { compile } from "../src/compile/compile.js";
import { parseHarness } from "../src/parser/parse-harness.js";
import { buildFleetReport } from "../src/fleet/report.js";
import { MockFsProvider } from "./helpers/mock-fs.js";
import { loadFixtureProject } from "./helpers/load-fixture-tree.js";

const IMPORT_FIXTURES_DIR = resolve(import.meta.dirname, "..", "fixtures", "import");

const YAML_ACME = `
version: "1"
metadata:
  name: acme
  description: test harness
instructions:
  operational: "Operational instructions, exactly as compiled."
`;

describe("buildFleetReport", () => {
  it("reports not-installed for adapters with no indicators in an empty scope", async () => {
    const fs = new MockFsProvider({}, "/project", "/home/user");
    const report = await buildFleetReport({ scopes: [{ kind: "project", label: "empty", fs }] });

    expect(report.scopes).toEqual([{ kind: "project", root: "/project", label: "empty" }]);
    const claudeRow = report.rows.find((r) => r.adapter === "claude-code")!;
    expect(claudeRow.cells["/project"].status).toBe("not-installed");
    expect(report.summary.notInstalled).toBeGreaterThan(0);
  });

  it("reports not-configured when a tool is detected but no valid harness.yaml exists", async () => {
    const fs = loadFixtureProject(resolve(IMPORT_FIXTURES_DIR, "already-compiled"));
    const report = await buildFleetReport({ scopes: [{ kind: "project", label: "already-compiled", fs }] });

    const claudeRow = report.rows.find((r) => r.adapter === "claude-code")!;
    expect(claudeRow.cells["/project"].status).toBe("not-configured");
  });

  it("reports in-sync immediately after a real compile, and drift after an on-disk edit", async () => {
    const fs = new MockFsProvider({}, "/project", "/home/user");
    const { config } = parseHarness(YAML_ACME);

    await fs.writeFile(fs.joinPath("/project", "harness.yaml"), YAML_ACME);
    await compile(YAML_ACME, ["claude-code"], fs, {});

    const reportAfterCompile = await buildFleetReport({
      scopes: [{ kind: "project", label: "acme", fs }],
      targets: ["claude-code"],
    });
    const rowAfterCompile = reportAfterCompile.rows.find((r) => r.adapter === "claude-code")!;
    expect(rowAfterCompile.cells["/project"].status).toBe("in-sync");
    expect(rowAfterCompile.cells["/project"].driftCount).toBe(0);

    // Simulate drift: overwrite the marker block content on disk directly.
    const current = await fs.readFile(fs.joinPath("/project", "CLAUDE.md"));
    await fs.writeFile(
      fs.joinPath("/project", "CLAUDE.md"),
      current.replace("Operational instructions, exactly as compiled.", "Someone edited this by hand."),
    );

    const reportAfterEdit = await buildFleetReport({
      scopes: [{ kind: "project", label: "acme", fs }],
      targets: ["claude-code"],
    });
    const rowAfterEdit = reportAfterEdit.rows.find((r) => r.adapter === "claude-code")!;
    expect(rowAfterEdit.cells["/project"].status).toBe("drift");
    expect(rowAfterEdit.cells["/project"].driftCount).toBeGreaterThan(0);
    expect(reportAfterEdit.summary.drift).toBeGreaterThan(0);

    // Sanity: config param unused directly but keeps parseHarness import meaningful for future assertions.
    expect(config.metadata?.name).toBe("acme");
  });

  it("aggregates multiple scopes independently, each keyed by its own root", async () => {
    const fsA = new MockFsProvider({}, "/project-a", "/home/user");
    const fsB = loadFixtureProject(resolve(IMPORT_FIXTURES_DIR, "already-compiled"), "/project-b");

    const report = await buildFleetReport({
      scopes: [
        { kind: "project", label: "a", fs: fsA },
        { kind: "project", label: "b", fs: fsB },
      ],
    });

    expect(report.scopes.map((s) => s.root)).toEqual(["/project-a", "/project-b"]);
    const claudeRow = report.rows.find((r) => r.adapter === "claude-code")!;
    expect(claudeRow.cells["/project-a"].status).toBe("not-installed");
    expect(claudeRow.cells["/project-b"].status).toBe("not-configured");
  });

  it("produces a JSON-serializable report (round-trips through JSON.stringify/parse)", async () => {
    const fs = new MockFsProvider({}, "/project", "/home/user");
    const report = await buildFleetReport({ scopes: [{ kind: "project", label: "empty", fs }] });

    const roundTripped = JSON.parse(JSON.stringify(report));
    expect(roundTripped).toEqual(report);
  });
});
