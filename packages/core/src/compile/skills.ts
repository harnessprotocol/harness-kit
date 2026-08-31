import type { FsProvider } from "../fs-provider.js";
import type {
  FileAction,
  HarnessConfig,
  HarnessPlugin,
  HarnessSkillRef,
  SurfaceId,
} from "../types.js";
import { findSkillFiles, computeSourceDir } from "./discovery.js";
import { computeFileHash } from "./check.js";
import { skillDirectoryDigest } from "../import/read-skills.js";
import { collectCapsuleFiles } from "../portability/capsule.js";

// Skills directory per target. null = plugin install system handles deployment (claude-code).
// Partial over SurfaceId: surfaces without compile machinery yet have no entry
// (the lookup below skips them, same as a null entry).
const SKILL_TARGET_DIR: Partial<Record<SurfaceId, string | null>> = {
  "claude-code": null,
  cursor: ".cursor/skills",
  "copilot-vscode": ".github/skills",
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

function safeManifestPath(path: string): boolean {
  return path.length > 0 &&
    !path.startsWith("/") &&
    !path.startsWith("~") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => part === "" || part === "." || part === "..");
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
  targets: SurfaceId[],
  fs: FsProvider,
): Promise<{ files: FileAction[]; skippedPlugins: string[] }> {
  const plugins = config.plugins ?? [];
  const skills = (config.skills ?? []).filter((skill) => skill.enabled !== false);
  if (plugins.length === 0 && skills.length === 0) {
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

  for (const skill of skills) {
    const skillFiles = await resolveDirectSkillFiles(skill, fs, cwd, home);
    if (!skillFiles) {
      skippedPlugins.push(
        `${skill.name}: skipped (direct skill source '${skill.source ?? "(missing)"}' did not contain SKILL.md)`,
      );
      continue;
    }
    for (const target of targets) {
      // Direct skills are native files for Claude Code too; only plugin-backed
      // skills retain the legacy plugin-install-system behavior above.
      const targetDir = target === "claude-code" ? ".claude/skills" : SKILL_TARGET_DIR[target];
      if (!targetDir) continue;
      for (const sourceFile of skillFiles) {
        files.push({
          path: fs.joinPath(targetDir, skill.name, sourceFile.path),
          content: sourceFile.path === "SKILL.md" ? adaptFrontmatter(sourceFile.content) : sourceFile.content,
          action: "create",
          platform: target,
          slot: "skills",
        });
      }
    }
  }

  return { files, skippedPlugins };
}

interface DirectSkillFile {
  path: string;
  content: string;
}

async function collectDirectSkillDirectory(
  root: string,
  current: string,
  fs: FsProvider,
  output: DirectSkillFile[],
  depth = 0,
): Promise<void> {
  if (depth > 12) throw new Error(`skill directory is nested too deeply: ${root}`);
  for (const entry of (await fs.readDir(current)).sort()) {
    if (entry === ".git" || entry === "capsule.json") continue;
    const fullPath = fs.joinPath(current, entry);
    const relative = fullPath.startsWith(`${root}/`) ? fullPath.slice(root.length + 1) : entry;
    if (await fs.isDirectory(fullPath)) {
      await collectDirectSkillDirectory(root, fullPath, fs, output, depth + 1);
    } else {
      output.push({ path: relative, content: await fs.readFile(fullPath) });
    }
  }
}

async function resolveDirectSkillFiles(
  skill: HarnessSkillRef,
  fs: FsProvider,
  cwd: string,
  home: string,
): Promise<DirectSkillFile[] | null> {
  if (!skill.source) return null;
  let sourcePath = computeSourceDir(skill.source, cwd, home, fs.joinPath.bind(fs));
  if (
    (!sourcePath || !(await fs.exists(sourcePath))) &&
    skill.integrity?.sha256
  ) {
    sourcePath = fs.joinPath(home, ".harness", "cache", "resources", skill.integrity.sha256, "content");
  }
  if (!sourcePath || !(await fs.exists(sourcePath))) return null;
  if (!(await fs.isDirectory(sourcePath))) {
    const files = sourcePath.endsWith("SKILL.md")
      ? [{ path: "SKILL.md", content: await fs.readFile(sourcePath) }]
      : null;
    if (files) verifyDirectSkillIntegrity(skill, files);
    return files;
  }
  const entrypoint = fs.joinPath(sourcePath, "SKILL.md");
  if (await fs.exists(entrypoint)) {
    const output: DirectSkillFile[] = [];
    await collectDirectSkillDirectory(sourcePath, sourcePath, fs, output);
    verifyDirectSkillIntegrity(skill, output);
    return output;
  }
  const found = await findSkillFiles(sourcePath, fs);
  if (found.length === 0) return null;
  const nestedRoot = fs.dirname(found[0]);
  const output: DirectSkillFile[] = [];
  await collectDirectSkillDirectory(nestedRoot, nestedRoot, fs, output);
  verifyDirectSkillIntegrity(skill, output);
  return output;
}

function verifyDirectSkillIntegrity(skill: HarnessSkillRef, files: DirectSkillFile[]): void {
  if (!skill.integrity?.sha256) return;
  const actual = skillDirectoryDigest(files.map((file) => ({
    path: file.path,
    digest: computeFileHash(file.content),
  })));
  if (actual !== skill.integrity.sha256) {
    throw new Error(`skill '${skill.name}' integrity mismatch: expected ${skill.integrity.sha256}, got ${actual}`);
  }
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
    if (plugin.integrity?.sha256) {
      const files = await collectCapsuleFiles(fs, sourceDir);
      const actual = skillDirectoryDigest(files.map((file) => ({
        path: file.path,
        digest: computeFileHash(file.content),
      })));
      if (actual !== plugin.integrity.sha256) {
        throw new Error(`plugin '${plugin.name}' integrity mismatch: expected ${plugin.integrity.sha256}, got ${actual}`);
      }
    }
    // 2. plugin.json manifest
    const manifestPath = fs.joinPath(sourceDir, "plugin.json");
    if (await fs.exists(manifestPath)) {
      try {
        const raw = await fs.readFile(manifestPath);
        const manifest: PluginManifest = JSON.parse(raw);
        if (manifest.skills && manifest.skills.length > 0) {
          for (const skill of manifest.skills) {
            if (!safeManifestPath(skill.path)) {
              throw new Error(`plugin '${plugin.name}' declares an unsafe skill path: ${skill.path}`);
            }
            const skillPath = fs.joinPath(sourceDir, skill.path);
            if (await fs.exists(skillPath)) {
              return fs.readFile(skillPath);
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("unsafe skill path")) throw error;
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
