import { describe, it, expect } from "vitest";
import { compileInstructions } from "../src/compile/instructions.js";
import { MockFsProvider } from "./helpers/mock-fs.js";
import type { HarnessConfig } from "../src/types.js";

function makeConfig(overrides: Partial<HarnessConfig> = {}): HarnessConfig {
  return {
    version: "1",
    metadata: { name: "test-harness", description: "Test" },
    instructions: {
      operational: "## Commands\n- Build: `pnpm build`",
      behavioral: "Be concise.",
      "import-mode": "merge",
    },
    ...overrides,
  };
}

describe("compileInstructions", () => {
  it("creates instruction files for Claude Code", async () => {
    const fs = new MockFsProvider();
    const config = makeConfig();
    const { files } = await compileInstructions(config, ["claude-code"], fs);

    expect(files).toHaveLength(2); // operational + behavioral
    const ops = files.find((f) => f.slot === "operational");
    expect(ops).toBeDefined();
    expect(ops!.path).toBe("CLAUDE.md");
    expect(ops!.content).toContain("<!-- BEGIN harness:test-harness:operational -->");
    expect(ops!.content).toContain("pnpm build");
    expect(ops!.content).toContain("<!-- END harness:test-harness:operational -->");
  });

  it("creates Cursor .mdc files with frontmatter", async () => {
    const fs = new MockFsProvider();
    const config = makeConfig();
    const { files } = await compileInstructions(config, ["cursor"], fs);

    const ops = files.find((f) => f.slot === "operational" && f.platform === "cursor");
    expect(ops).toBeDefined();
    expect(ops!.path).toBe(".cursor/rules/harness.mdc");
    expect(ops!.content).toContain("description: Harness operational instructions");
    expect(ops!.content).toContain("alwaysApply: true");
  });

  it("creates Copilot files with applyTo frontmatter", async () => {
    const fs = new MockFsProvider();
    const config = makeConfig();
    const { files } = await compileInstructions(config, ["copilot"], fs);

    const ops = files.find((f) => f.slot === "operational");
    expect(ops).toBeDefined();
    expect(ops!.path).toBe(".github/copilot-instructions.md");
    expect(ops!.content).toContain('applyTo: "**"');
  });

  it("skips identity slot for non-Claude-Code targets", async () => {
    const fs = new MockFsProvider();
    const config = makeConfig({
      instructions: {
        operational: "ops",
        identity: "I am helpful.",
        "import-mode": "merge",
      },
    });
    const { files } = await compileInstructions(config, ["cursor", "copilot"], fs);

    const identity = files.filter((f) => f.slot === "identity");
    expect(identity).toHaveLength(0);
  });

  it("updates existing marker blocks on merge", async () => {
    const existingContent = [
      "# My manual content",
      "",
      "<!-- BEGIN harness:test-harness:operational -->",
      "old content",
      "<!-- END harness:test-harness:operational -->",
    ].join("\n");

    const fs = new MockFsProvider({
      "/project/CLAUDE.md": existingContent,
    });

    const config = makeConfig({
      instructions: {
        operational: "new content",
        "import-mode": "merge",
      },
    });

    const { files } = await compileInstructions(config, ["claude-code"], fs);
    const ops = files.find((f) => f.slot === "operational");
    expect(ops).toBeDefined();
    expect(ops!.action).toBe("update");
    expect(ops!.content).toContain("# My manual content");
    expect(ops!.content).toContain("new content");
    expect(ops!.content).not.toContain("old content");
  });

  it("returns needs-confirmation for replace mode", async () => {
    const fs = new MockFsProvider({
      "/project/CLAUDE.md": "existing content",
    });

    const config = makeConfig({
      instructions: {
        operational: "replacement",
        "import-mode": "replace",
      },
    });

    const { files } = await compileInstructions(config, ["claude-code"], fs);
    const ops = files.find((f) => f.slot === "operational");
    expect(ops!.action).toBe("needs-confirmation");
  });

  it("returns empty files for skip mode", async () => {
    const fs = new MockFsProvider();
    const config = makeConfig({
      instructions: {
        operational: "ops",
        "import-mode": "skip",
      },
    });

    const { files } = await compileInstructions(config, ["claude-code"], fs);
    expect(files).toHaveLength(0);
  });

  it("uses 'default' name when metadata.name is absent", async () => {
    const fs = new MockFsProvider();
    const config: HarnessConfig = {
      version: "1",
      kind: "fragment",
      instructions: {
        operational: "ops",
        "import-mode": "merge",
      },
    };

    const { files } = await compileInstructions(config, ["claude-code"], fs);
    const ops = files.find((f) => f.slot === "operational");
    expect(ops!.content).toContain("<!-- BEGIN harness:default:operational -->");
  });
});
