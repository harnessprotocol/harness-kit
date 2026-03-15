import { describe, it, expect } from "vitest";
import { compileSkills } from "../src/compile/skills.js";
import { MockFsProvider } from "./helpers/mock-fs.js";
import type { HarnessConfig } from "../src/types.js";

function makeConfig(plugins: HarnessConfig["plugins"] = []): HarnessConfig {
  return {
    version: "1",
    metadata: { name: "test", description: "test" },
    plugins,
  };
}

describe("compileSkills", () => {
  it("copies SKILL.md to target directories", async () => {
    const fs = new MockFsProvider({
      "/home/user/.claude/skills/explain/SKILL.md":
        "---\nname: explain\ndescription: Layered explanations\n---\n\n# Explain",
    });

    const config = makeConfig([
      { name: "explain", source: "siracusa5/harness-kit" },
    ]);

    const { files, skippedPlugins } = await compileSkills(config, ["cursor"], fs);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(".cursor/skills/explain/SKILL.md");
    expect(files[0].content).toContain("# Explain");
    expect(skippedPlugins).toHaveLength(0);
  });

  it("skips Claude Code (uses plugin install system)", async () => {
    const fs = new MockFsProvider({
      "/home/user/.claude/skills/explain/SKILL.md":
        "---\nname: explain\n---\n\n# Explain",
    });

    const config = makeConfig([
      { name: "explain", source: "siracusa5/harness-kit" },
    ]);

    const { files } = await compileSkills(config, ["claude-code"], fs);
    expect(files).toHaveLength(0);
  });

  it("reports skipped plugins when SKILL.md not found", async () => {
    const fs = new MockFsProvider();
    const config = makeConfig([
      { name: "missing-plugin", source: "someone/repo" },
    ]);

    const { files, skippedPlugins } = await compileSkills(config, ["cursor"], fs);
    expect(files).toHaveLength(0);
    expect(skippedPlugins).toHaveLength(1);
    expect(skippedPlugins[0]).toContain("missing-plugin");
    expect(skippedPlugins[0]).toContain("skipped");
  });

  it("renames dependencies to compatibility in frontmatter", async () => {
    const fs = new MockFsProvider({
      "/home/user/.claude/skills/test/SKILL.md":
        "---\nname: test\ndescription: Test skill\ndependencies: node >= 18\n---\n\n# Test",
    });

    const config = makeConfig([
      { name: "test", source: "test/repo" },
    ]);

    const { files } = await compileSkills(config, ["cursor"], fs);
    expect(files[0].content).toContain("compatibility:");
    expect(files[0].content).not.toContain("dependencies:");
  });

  it("copies to both Cursor and Copilot directories", async () => {
    const fs = new MockFsProvider({
      "/home/user/.claude/skills/explain/SKILL.md":
        "---\nname: explain\n---\n\n# Explain",
    });

    const config = makeConfig([
      { name: "explain", source: "siracusa5/harness-kit" },
    ]);

    const { files } = await compileSkills(config, ["cursor", "copilot"], fs);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path)).toContain(".cursor/skills/explain/SKILL.md");
    expect(files.map((f) => f.path)).toContain(".github/skills/explain/SKILL.md");
  });
});
