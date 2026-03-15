import type { FsProvider } from "../fs-provider.js";
import type {
  FileAction,
  HarnessConfig,
  HarnessPlugin,
  TargetPlatform,
} from "../types.js";

const SKILL_SEARCH_PATHS = [
  "~/.claude/skills/{name}/SKILL.md",
  ".cursor/skills/{name}/SKILL.md",
  ".agents/skills/{name}/SKILL.md",
];

const SKILL_TARGET_DIR: Record<TargetPlatform, string | null> = {
  "claude-code": null, // uses plugin install system
  cursor: ".cursor/skills",
  copilot: ".github/skills",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function adaptFrontmatter(content: string): string {
  // Parse frontmatter if present
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return content;

  let frontmatter = fmMatch[1];
  const body = fmMatch[2];

  // Rename dependencies → compatibility
  frontmatter = frontmatter.replace(
    /^dependencies:/m,
    "compatibility:",
  );

  // Enforce name constraints
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  if (nameMatch) {
    const slugged = slugify(nameMatch[1].trim());
    frontmatter = frontmatter.replace(
      /^name:\s*.+$/m,
      `name: ${slugged}`,
    );
  }

  // Truncate description
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  if (descMatch && descMatch[1].length > 1024) {
    const truncated = descMatch[1].slice(0, 1024).replace(/\s+\S*$/, "") + "…";
    frontmatter = frontmatter.replace(
      /^description:\s*.+$/m,
      `description: ${truncated}`,
    );
  }

  return `---\n${frontmatter}\n---\n${body}`;
}

export async function compileSkills(
  config: HarnessConfig,
  targets: TargetPlatform[],
  fs: FsProvider,
): Promise<{ files: FileAction[]; skippedPlugins: string[] }> {
  const plugins = config.plugins;
  if (!plugins || plugins.length === 0) {
    return { files: [], skippedPlugins: [] };
  }

  const cwd = fs.cwd();
  const home = await fs.homedir();
  const files: FileAction[] = [];
  const skippedPlugins: string[] = [];

  for (const plugin of plugins) {
    const skillContent = await findSkillMd(plugin, fs, cwd, home);
    if (!skillContent) {
      skippedPlugins.push(
        `${plugin.name}: skipped (no SKILL.md found in ~/.claude/skills/, .cursor/skills/, or .agents/skills/)`,
      );
      continue;
    }

    const adapted = adaptFrontmatter(skillContent);

    for (const target of targets) {
      const targetDir = SKILL_TARGET_DIR[target];
      if (!targetDir) continue; // claude-code skips file copy

      const destPath = fs.joinPath(targetDir, plugin.name, "SKILL.md");
      files.push({
        path: destPath,
        content: adapted,
        action: "create",
        platform: target,
        slot: "skills",
      });
    }
  }

  return { files, skippedPlugins };
}

async function findSkillMd(
  plugin: HarnessPlugin,
  fs: FsProvider,
  cwd: string,
  home: string,
): Promise<string | null> {
  for (const template of SKILL_SEARCH_PATHS) {
    const relPath = template
      .replace("{name}", plugin.name)
      .replace("~", home);

    const fullPath = relPath.startsWith("/")
      ? relPath
      : fs.joinPath(cwd, relPath);

    if (await fs.exists(fullPath)) {
      return fs.readFile(fullPath);
    }
  }
  return null;
}
