import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPluginSkills } from "./read-skills.js";
import { scanForMarketplace } from "./scan.js";
import type { MarketplaceCategory, MarketplaceData, MarketplaceMcp, MarketplacePlugin } from "./types.js";

// ── marketplace.json shape (input) ──────────────────────────────

interface RawCategory {
  slug: string;
  name: string;
  display_order: number;
}

interface RawMarketplacePlugin {
  name: string;
  source: string;
  description: string;
  version: string;
  author?: { name?: string };
  license?: string;
  category: string;
  tags?: string[];
}

interface RawMarketplace {
  name: string;
  owner?: { name?: string };
  categories: RawCategory[];
  plugins: RawMarketplacePlugin[];
}

interface RawPluginManifest {
  requires?: {
    env?: Array<{
      name: string;
      description?: string;
      required?: boolean;
      sensitive?: boolean;
      when?: string;
    }>;
  };
  mcp?: {
    server?: { command: string; args?: string[]; transport?: string };
  };
}

// ── Repo root discovery ─────────────────────────────────────────

/** Walks up from a starting directory until it finds the marketplace manifest. */
export function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, ".claude-plugin", "marketplace.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not find .claude-plugin/marketplace.json above ${startDir}`,
      );
    }
    dir = parent;
  }
}

// ── Generator ───────────────────────────────────────────────────

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

function toMcp(manifest: RawPluginManifest): MarketplaceMcp | null {
  const server = manifest.mcp?.server;
  if (!server) return null;
  return {
    command: server.command,
    args: server.args ?? [],
    transport: server.transport ?? "stdio",
  };
}

/** Builds the full marketplace data blob from the git repo at `repoRoot`. */
export async function generateMarketplaceData(repoRoot: string): Promise<MarketplaceData> {
  const marketplace = await readJson<RawMarketplace>(
    join(repoRoot, ".claude-plugin", "marketplace.json"),
  );

  const marketplaceName = marketplace.name;
  const categories: MarketplaceCategory[] = marketplace.categories
    .map((c) => ({ slug: c.slug, name: c.name, displayOrder: c.display_order }))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const plugins: MarketplacePlugin[] = [];
  for (const raw of marketplace.plugins) {
    const pluginDir = resolve(repoRoot, raw.source);
    const manifest = await readJson<RawPluginManifest>(
      join(pluginDir, ".claude-plugin", "plugin.json"),
    );

    const [skills, security] = await Promise.all([
      readPluginSkills(pluginDir),
      scanForMarketplace(pluginDir),
    ]);

    plugins.push({
      name: raw.name,
      slug: raw.name,
      description: raw.description,
      version: raw.version,
      author: raw.author?.name ?? marketplace.owner?.name ?? "unknown",
      license: raw.license ?? "Apache-2.0",
      category: raw.category,
      tags: raw.tags ?? [],
      repoPath: raw.source,
      sourceId: "first-party",
      installCommand: `/plugin install ${raw.name}@${marketplaceName}`,
      requiresEnv: (manifest.requires?.env ?? []).map((e) => ({
        name: e.name,
        description: e.description ?? "",
        required: e.required ?? false,
        sensitive: e.sensitive ?? false,
        ...(e.when ? { when: e.when } : {}),
      })),
      mcp: toMcp(manifest),
      skills,
      security,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    marketplaceName,
    owner: marketplace.owner?.name ?? "unknown",
    categories,
    plugins,
  };
}

// ── CLI ─────────────────────────────────────────────────────────

interface CliOptions {
  strict: boolean;
  outPath: string;
}

function parseArgs(argv: string[], repoRoot: string): CliOptions {
  const strict = argv.includes("--strict");
  const outFlag = argv.indexOf("--out");
  const outPath =
    outFlag !== -1 && argv[outFlag + 1]
      ? resolve(process.cwd(), argv[outFlag + 1])
      : join(repoRoot, "website", "lib", "marketplace", "marketplace.generated.json");
  return { strict, outPath };
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
  const { strict, outPath } = parseArgs(process.argv.slice(2), repoRoot);

  const data = await generateMarketplaceData(repoRoot);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");

  const failed = data.plugins.filter((p) => p.security.status === "failed");
  console.log(
    `Generated ${data.plugins.length} plugins → ${outPath}` +
      (failed.length ? ` (${failed.length} failed security scan)` : ""),
  );

  if (strict && failed.length > 0) {
    console.error(
      `Strict mode: ${failed.length} plugin(s) failed the security scan: ${failed
        .map((p) => p.name)
        .join(", ")}`,
    );
    process.exitCode = 1;
  }
}

const isEntrypoint =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
