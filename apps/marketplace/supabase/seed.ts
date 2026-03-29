/**
 * Seed script for the Harness Kit marketplace Supabase database.
 *
 * Reads marketplace.json and plugin SKILL.md / README.md files from the repo,
 * then upserts categories, tags, components, and join records.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx seed.ts
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Paths are relative to this file (marketplace/supabase/seed.ts)
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const MARKETPLACE_JSON_PATH = path.join(
  REPO_ROOT,
  ".claude-plugin/marketplace.json"
);
const PLUGINS_DIR = path.join(REPO_ROOT, "plugins");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MarketplaceJson {
  categories: { slug: string; name: string; display_order: number }[];
  plugins: {
    name: string;
    source: string;
    description: string;
    version: string;
    author: { name: string };
    license: string;
    category: string;
    tags: string[];
  }[];
}

function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Reads and concatenates all SKILL.md files found under a plugin's skills/ directory.
 * Most plugins have a single skill; harness-share has several.
 */
function readSkillMds(pluginName: string): string | null {
  const skillsDir = path.join(PLUGINS_DIR, pluginName, "skills");
  if (!fs.existsSync(skillsDir)) return null;

  const skillDirs = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const parts: string[] = [];
  for (const dir of skillDirs) {
    const content = readFileOrNull(path.join(skillsDir, dir, "SKILL.md"));
    if (content) parts.push(content);
  }
  return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
}

/**
 * Derives whether a plugin should be classified as "skill" or "plugin".
 * A plugin is a "skill" only if it has exactly one skill directory and no agents,
 * scripts, or hooks directories. Everything else is a "plugin".
 */
function derivePluginType(pluginName: string): "skill" | "plugin" {
  const pluginDir = path.join(PLUGINS_DIR, pluginName);
  const skillsDir = path.join(pluginDir, "skills");

  let skillCount = 0;
  if (fs.existsSync(skillsDir)) {
    skillCount = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory()).length;
  }

  const hasAgents = fs.existsSync(path.join(pluginDir, "agents"));
  const hasScripts = fs.existsSync(path.join(pluginDir, "scripts"));
  const hasHooks = fs.existsSync(path.join(pluginDir, "hooks"));

  return skillCount > 1 || hasAgents || hasScripts || hasHooks
    ? "plugin"
    : "skill";
}

/**
 * Reads and concatenates all README.md files found under a plugin's skills/ directory.
 */
function readReadmeMds(pluginName: string): string | null {
  const skillsDir = path.join(PLUGINS_DIR, pluginName, "skills");
  if (!fs.existsSync(skillsDir)) return null;

  const skillDirs = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const parts: string[] = [];
  for (const dir of skillDirs) {
    const content = readFileOrNull(path.join(skillsDir, dir, "README.md"));
    if (content) parts.push(content);
  }
  return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
}

// ---------------------------------------------------------------------------
// Seed steps
// ---------------------------------------------------------------------------

async function seedCategories(
  categories: MarketplaceJson["categories"]
): Promise<Map<string, string>> {
  console.log(`Seeding ${categories.length} categories...`);

  const { data, error } = await supabase
    .from("categories")
    .upsert(categories, { onConflict: "slug" })
    .select("id, slug");

  if (error) {
    throw new Error(`Failed to seed categories: ${error.message}`);
  }

  const slugToId = new Map<string, string>();
  for (const row of data!) {
    slugToId.set(row.slug, row.id);
  }

  console.log(`  Seeded categories: ${[...slugToId.keys()].join(", ")}`);
  return slugToId;
}

async function seedTags(tagSlugs: string[]): Promise<Map<string, string>> {
  console.log(`Seeding ${tagSlugs.length} tags...`);

  const rows = tagSlugs.map((slug) => ({ slug }));

  const { data, error } = await supabase
    .from("tags")
    .upsert(rows, { onConflict: "slug" })
    .select("id, slug");

  if (error) {
    throw new Error(`Failed to seed tags: ${error.message}`);
  }

  const slugToId = new Map<string, string>();
  for (const row of data!) {
    slugToId.set(row.slug, row.id);
  }

  console.log(`  Seeded ${slugToId.size} unique tags`);
  return slugToId;
}

async function seedComponents(
  plugins: MarketplaceJson["plugins"],
  categoryMap: Map<string, string>,
  tagMap: Map<string, string>
): Promise<void> {
  console.log(`Seeding ${plugins.length} components...`);

  // Plausible seed install counts — real counts come from the install API route.
  const SEED_INSTALL_COUNTS: Record<string, number> = {
    research: 1240,
    review: 980,
    explain: 870,
    lineage: 640,
    orient: 590,
    capture: 520,
    "harness-share": 480,
    docgen: 430,
    "open-pr": 390,
    "merge-pr": 360,
    "pr-sweep": 310,
    stats: 290,
    membrain: 260,
    board: 230,
    "iterm-notify": 190,
    "frontend-design": 170,
  };

  for (const plugin of plugins) {
    const skillMd = readSkillMds(plugin.name);
    const readmeMd = readReadmeMds(plugin.name);

    // Humanize the plugin name: "data-lineage" -> "Data Lineage"
    const displayName = plugin.name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    const component = {
      slug: plugin.name,
      name: displayName,
      type: derivePluginType(plugin.name),
      description: plugin.description,
      trust_tier: "official" as const,
      version: plugin.version,
      author: plugin.author,
      license: plugin.license,
      skill_md: skillMd,
      readme_md: readmeMd,
      repo_url: `https://github.com/harnessprotocol/harness-kit/tree/main/plugins/${plugin.name}`,
      install_count: SEED_INSTALL_COUNTS[plugin.name] ?? 100,
    };

    const { data, error } = await supabase
      .from("components")
      .upsert(component, { onConflict: "slug" })
      .select("id")
      .single();

    if (error) {
      throw new Error(
        `Failed to upsert component "${plugin.name}": ${error.message}`
      );
    }

    const componentId = data!.id;
    console.log(`  Component "${plugin.name}" -> ${componentId}`);

    // -- Category join --
    const categoryId = categoryMap.get(plugin.category);
    if (categoryId) {
      const { error: catErr } = await supabase
        .from("component_categories")
        .upsert(
          { component_id: componentId, category_id: categoryId },
          { onConflict: "component_id,category_id" }
        );

      if (catErr) {
        console.warn(
          `  Warning: failed to link category "${plugin.category}" for "${plugin.name}": ${catErr.message}`
        );
      }
    } else {
      console.warn(
        `  Warning: category "${plugin.category}" not found for plugin "${plugin.name}"`
      );
    }

    // -- Tag joins --
    for (const tagSlug of plugin.tags) {
      const tagId = tagMap.get(tagSlug);
      if (!tagId) {
        console.warn(
          `  Warning: tag "${tagSlug}" not found for plugin "${plugin.name}"`
        );
        continue;
      }

      const { error: tagErr } = await supabase
        .from("component_tags")
        .upsert(
          { component_id: componentId, tag_id: tagId },
          { onConflict: "component_id,tag_id" }
        );

      if (tagErr) {
        console.warn(
          `  Warning: failed to link tag "${tagSlug}" for "${plugin.name}": ${tagErr.message}`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== Harness Kit Marketplace Seed ===\n");

  // 1. Read marketplace.json
  console.log(`Reading ${MARKETPLACE_JSON_PATH}`);
  const raw = fs.readFileSync(MARKETPLACE_JSON_PATH, "utf-8");
  const marketplace: MarketplaceJson = JSON.parse(raw);
  console.log(
    `  Found ${marketplace.categories.length} categories, ${marketplace.plugins.length} plugins\n`
  );

  // 2. Seed categories
  const categoryMap = await seedCategories(marketplace.categories);
  console.log();

  // 3. Collect and seed tags (deduplicated)
  const allTags = new Set<string>();
  for (const plugin of marketplace.plugins) {
    for (const tag of plugin.tags) {
      allTags.add(tag);
    }
  }
  const tagMap = await seedTags([...allTags].sort());
  console.log();

  // 4. Seed components with join records
  await seedComponents(marketplace.plugins, categoryMap, tagMap);

  console.log("\n=== Seed complete ===");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
