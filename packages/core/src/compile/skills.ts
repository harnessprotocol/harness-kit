import type { FsProvider } from "../fs-provider.js";
import type {
  FileAction,
  HarnessConfig,
  HarnessPlugin,
  TargetPlatform,
} from "../types.js";
import { findSkillFiles, computeSourceDir } from "./discovery.js";

// Skills directory per target. null = plugin install system handles deployment (claude-code).
const SKILL_TARGET_DIR: Record<TargetPlatform, string | null> = {
  "claude-code": null,
  cursor: ".cursor/skills",
  copilot: ".github/skills",
  codex: ".agents/skills",
  opencode: ".opencode/skills",
  windsurf: ".windsurf/skills",
  gemini: ".gemini/skills",
  junie: ".junie/skills",
};

// Legacy deployed-location search paths — kept until harness sync provides a populated cache.
// Searched last so they don't shadow source-resolved skills.
const LEGACY_SEARCH_PATHS = [
  "~/.claude/skills/{name}/SKILL.md",
  ".cursor/skills/{name}/SKILL.md",
  ".agents/skills/{name}/SKILL.md",
];

interface PluginManifest {
  skills?: Array<{ name: string; path: string }>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function adaptFrontmatter(content: string): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return content;

  let frontmatter = fmMatch[1];
  const body = fmMatch[2];

  // Rename dependencies → compatibility
  frontmatter = frontmatter.replace(/^dependencies:/m, "compatibility:");

  // Enforce name constraints
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  if (nameMatch) {
    const slugged = slugify(nameMatch[1].trim());
    frontmatter = frontmatter.replace(/^name:\s*.+$/m, `name: ${slugged}`);
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
    const skillContent = await resolveSkillContent(plugin, fs, cwd, home);
    if (!skillContent) {
      skippedPlugins.push(
        `${plugin.name}: skipped (no SKILL.md found — checked inline declaration, source dir, and legacy paths)`,
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

/**
 * Resolve a plugin's SKILL.md content using manifest-first resolution order:
 *
 * 1. Inline `skills` declared in harness.yaml (plugin.skills[].path)
 * 2. Source dir → plugin.json manifest → declared skill paths
 * 3. Source dir → recursive walker fallback
 * 4. Legacy deployed-location fallback (kept until harness sync populates the cache)
 */
async function resolveSkillContent(
  plugin: HarnessPlugin,
  fs: FsProvider,
  cwd: string,
  home: string,
): Promise<string | null> {
  // 1. Inline skills in harness.yaml
  if (plugin.skills && plugin.skills.length > 0) {
    for (const skill of plugin.skills) {
      const skillPath = skill.path.startsWith("/")
        ? skill.path
        : fs.joinPath(cwd, skill.path);
      if (await fs.exists(skillPath)) {
        return fs.readFile(skillPath);
      }
    }
  }

  // 2 + 3. Source-based resolution
  const sourceDir = computeSourceDir(
    plugin.source,
    cwd,
    home,
    fs.joinPath.bind(fs),
  );

  if (sourceDir !== null && (await fs.exists(sourceDir))) {
    // 2. plugin.json manifest
    const manifestPath = fs.joinPath(sourceDir, "plugin.json");
    if (await fs.exists(manifestPath)) {
      try {
        const raw = await fs.readFile(manifestPath);
        const manifest: PluginManifest = JSON.parse(raw);
        if (manifest.skills && manifest.skills.length > 0) {
          for (const skill of manifest.skills) {
            const skillPath = fs.joinPath(sourceDir, skill.path);
            if (await fs.exists(skillPath)) {
              return fs.readFile(skillPath);
            }
          }
        }
      } catch {
        // Malformed plugin.json — fall through to walker
      }
    }

    // 3. Walker fallback
    const found = await findSkillFiles(sourceDir, fs);
    if (found.length > 0) {
      return fs.readFile(found[0]);
    }
  }

  // 4. Legacy fallback
  return findSkillMdLegacy(plugin, fs, cwd, home);
}

async function findSkillMdLegacy(
  plugin: HarnessPlugin,
  fs: FsProvider,
  cwd: string,
  home: string,
): Promise<string | null> {
  for (const template of LEGACY_SEARCH_PATHS) {
    const relPath = template.replace("{name}", plugin.name).replace("~", home);
    const fullPath = relPath.startsWith("/")
      ? relPath
      : fs.joinPath(cwd, relPath);
    if (await fs.exists(fullPath)) {
      return fs.readFile(fullPath);
    }
  }
  return null;
}
