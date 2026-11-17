import { describe, it, expect } from "vitest";
import { importMachine } from "../src/import/import-project.js";
import { readAdapterSkills } from "../src/import/read-skills.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const HOME = "/home/user";
const BLOCKED = `${HOME}/.claude/skills/linked/SKILL.md`;

/**
 * A reader that refuses one file the way Tauri's fs scope does for a symlinked
 * SKILL.md whose target lies outside the capability scope.
 */
class OneForbiddenFile extends MockFsProvider {
  async readFile(path: string): Promise<string> {
    if (path === BLOCKED) {
      throw new Error(`forbidden path: ${path}, maybe it is not allowed on the scope`);
    }
    return super.readFile(path);
  }
}

function machine(): OneForbiddenFile {
  return new OneForbiddenFile(
    {
      [`${HOME}/CLAUDE.md`]: "# Global instructions\n",
      [`${HOME}/.claude/skills/alpha/SKILL.md`]: "---\nname: alpha\n---\nAlpha body\n",
      [BLOCKED]: "---\nname: linked\n---\nUnreachable\n",
      [`${HOME}/.claude/skills/zeta/SKILL.md`]: "---\nname: zeta\n---\nZeta body\n",
    },
    HOME,
    HOME,
  );
}

describe("machine scan with an unreadable skill file", () => {
  it("keeps the readable skills and reports the unreadable one as skipped", async () => {
    const fragment = await readAdapterSkills(machine(), HOME, "claude-code");

    expect(fragment?.skills?.skills.map((skill) => skill.name)).toEqual(["alpha", "zeta"]);
    expect(fragment?.skipped).toEqual([
      { file: ".claude/skills/linked/SKILL.md", reason: expect.stringContaining("forbidden path") },
    ]);
  });

  it("completes importMachine instead of rejecting, and surfaces the skip in findings", async () => {
    const result = await importMachine({ fs: machine() });

    const claudeCode = result.findings.adapters.find((adapter) => adapter.adapter === "claude-code")!;
    expect(claudeCode.skipped).toContainEqual({
      file: ".claude/skills/linked/SKILL.md",
      reason: expect.stringContaining("forbidden path"),
    });
    expect(result.harnessYaml).toContain("alpha");
    expect(result.harnessYaml).toContain("zeta");
    expect(result.harnessYaml).not.toContain("linked");
  });
});
