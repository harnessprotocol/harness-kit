import type { AdapterId } from "../adapters/adapter.js";
import { computeFileHash } from "../compile/check.js";
import { findSkillFiles } from "../compile/discovery.js";
import type { FsProvider } from "../fs-provider.js";
import type { ImportedFragment, ImportedSkillRef } from "./types.js";
import { TARGETS } from "../adapters/target-metadata.js";
import { collectCapsuleFiles } from "../portability/capsule.js";

const PROJECT_SKILL_DIRS: Record<AdapterId, string[]> = {
  "claude-code": [".claude/skills"],
  cursor: [".cursor/skills"],
  copilot: [".github/skills"],
  opencode: [".opencode/skills"],
  pi: [".pi/skills"],
  "agents-md": [".agents/skills", ".opencode/skills", ".windsurf/skills", ".gemini/skills", ".junie/skills"],
};

function globalSkillDir(target: "claude-code" | "cursor" | "copilot" | "opencode"): string {
  return TARGETS.find((candidate) => candidate.id === target)!.globalSkillsDir;
}

const GLOBAL_SKILL_DIRS: Record<AdapterId, string[]> = {
  "claude-code": [globalSkillDir("claude-code")],
  cursor: [globalSkillDir("cursor")],
  copilot: [globalSkillDir("copilot")],
  opencode: [globalSkillDir("opencode")],
  pi: [".pi/skills"],
  "agents-md": TARGETS
    .filter((target) => ["codex", "opencode", "windsurf", "gemini", "junie"].includes(target.id))
    .map((target) => target.globalSkillsDir),
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

export function skillDirectoryDigest(files: Array<{ path: string; digest: string }>): string {
  const normalized = [...new Map(files.map((file) => [`${file.path}\0${file.digest}`, file])).values()]
    .sort((left, right) => left.path.localeCompare(right.path));
  return computeFileHash(JSON.stringify(normalized));
}

export async function readAdapterSkills(
  fs: FsProvider,
  projectRoot: string,
  adapter: AdapterId,
): Promise<ImportedFragment | null> {
  const skills: ImportedSkillRef[] = [];
  const seen = new Set<string>();
  const personal = projectRoot === (await fs.homedir());
  const directories = personal ? GLOBAL_SKILL_DIRS[adapter] : PROJECT_SKILL_DIRS[adapter];

  for (const directory of directories) {
    const root = fs.joinPath(projectRoot, directory);
    if (!(await fs.exists(root))) continue;
    for (const file of (await findSkillFiles(root, fs, 8)).sort()) {
      const content = await fs.readFile(file);
      const relative = relativeTo(projectRoot, file);
      const name = frontmatterName(content, dirname(relative).split("/").pop() ?? "skill");
      const sourceRoot = dirname(file);
      const directoryFiles = await collectCapsuleFiles(fs, sourceRoot);
      const digest = skillDirectoryDigest(directoryFiles.map((entry) => ({
        path: entry.path,
        digest: computeFileHash(entry.content),
      })));
      const duplicateKey = `${name}\u0000${digest}`;
      if (seen.has(duplicateKey)) continue;
      seen.add(duplicateKey);
      const sourceDirectory = dirname(relative);
      skills.push({
        name,
        path: relative,
        sourcePath: `./${sourceDirectory}`,
        digest,
        scope: personal ? "personal" : "project",
        source: { adapter, file: relative },
      });
    }
  }

  return skills.length
    ? { domain: "skills", config: {}, warnings: [], skills: { skills } }
    : null;
}
