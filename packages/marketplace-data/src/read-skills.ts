import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { MarketplaceSkill } from "./types.js";

interface SkillFrontmatter {
  name?: string;
  description?: string;
  dependencies?: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * SKILL.md frontmatter is flat `key: value`, and descriptions routinely contain
 * colons (e.g. "Use when ...: foo"), which a strict YAML parser rejects. We only
 * need scalar fields, so parse line-based: everything after the first `:` on a
 * top-level key line is the raw value.
 */
export function parseSkillMarkdown(raw: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = raw.match(FRONTMATTER);
  if (!match) {
    return { frontmatter: {}, body: raw.trim() };
  }

  const frontmatter: SkillFrontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s?(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = unquote(kv[2]);
    if (key === "name" || key === "description" || key === "dependencies") {
      frontmatter[key] = value;
    }
  }

  const body = raw.slice(match[0].length).trim();
  return { frontmatter, body };
}

/**
 * Reads every `skills/<dir>/SKILL.md` under a plugin directory. Skill dir names
 * do not always match the plugin name (e.g. membrain → skills/memory, and
 * harness-share has five skills), so we enumerate directories rather than guess.
 */
export async function readPluginSkills(pluginDir: string): Promise<MarketplaceSkill[]> {
  const skillsRoot = join(pluginDir, "skills");

  let entries: string[];
  try {
    entries = await readdir(skillsRoot);
  } catch {
    return [];
  }

  const skills: MarketplaceSkill[] = [];
  for (const dir of entries.sort()) {
    const skillFile = join(skillsRoot, dir, "SKILL.md");
    let raw: string;
    try {
      const info = await stat(join(skillsRoot, dir));
      if (!info.isDirectory()) continue;
      raw = await readFile(skillFile, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseSkillMarkdown(raw);
    skills.push({
      dir,
      name: frontmatter.name ?? dir,
      description: frontmatter.description ?? "",
      ...(frontmatter.dependencies ? { dependencies: frontmatter.dependencies } : {}),
      body,
    });
  }

  return skills;
}
