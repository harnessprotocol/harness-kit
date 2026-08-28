import type { AdapterId } from "../adapters/adapter.js";
import { computeFileHash } from "../compile/check.js";
import { findSkillFiles } from "../compile/discovery.js";
import type { FsProvider } from "../fs-provider.js";
import type { ImportedFragment, ImportedSkillRef } from "./types.js";

const SKILL_DIRS: Record<AdapterId, string[]> = {
  "claude-code": [".claude/skills"],
  cursor: [".cursor/skills"],
  copilot: [".github/skills"],
  opencode: [".opencode/skills"],
  pi: [".pi/skills"],
  "agents-md": [".agents/skills", ".opencode/skills", ".windsurf/skills", ".gemini/skills", ".junie/skills"],
};

function frontmatterName(content: string, fallback: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?^name:\s*([^\r\n]+)$/m);
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") || fallback;
}

function relativeTo(root: string, path: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function dirname(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

export async function readAdapterSkills(
  fs: FsProvider,
  projectRoot: string,
  adapter: AdapterId,
): Promise<ImportedFragment | null> {
  const skills: ImportedSkillRef[] = [];
  const seen = new Set<string>();

  for (const directory of SKILL_DIRS[adapter]) {
    const root = fs.joinPath(projectRoot, directory);
    if (!(await fs.exists(root))) continue;
    for (const file of (await findSkillFiles(root, fs, 8)).sort()) {
      const content = await fs.readFile(file);
      const relative = relativeTo(projectRoot, file);
      const name = frontmatterName(content, dirname(relative).split("/").pop() ?? "skill");
      const digest = computeFileHash(content);
      const duplicateKey = `${name}\u0000${digest}`;
      if (seen.has(duplicateKey)) continue;
      seen.add(duplicateKey);
      const sourceDirectory = dirname(relative);
      skills.push({
        name,
        path: relative,
        sourcePath: `./${sourceDirectory}`,
        digest,
        scope: projectRoot === (await fs.homedir()) ? "personal" : "project",
        source: { adapter, file: relative },
      });
    }
  }

  return skills.length
    ? { domain: "skills", config: {}, warnings: [], skills: { skills } }
    : null;
}
