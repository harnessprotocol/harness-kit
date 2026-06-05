import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { validateHarnessYaml } from "@harness-kit/core";
import type { ProfileYaml } from "@harness-kit/shared";
import type {
  MarketplacePlugin,
  MarketplaceProfile,
  ProfileKnowledge,
  ProfilePluginRef,
  TrustTier,
} from "./types.js";

// ── Trust severity ordering ──────────────────────────────────

const TRUST_SEVERITY: Record<TrustTier, number> = {
  warning: 3,
  caution: 2,
  unscanned: 1,
  verified: 0,
};

function worstTrust(tiers: TrustTier[]): TrustTier {
  if (tiers.length === 0) return "unscanned";
  return tiers.reduce((worst, tier) =>
    TRUST_SEVERITY[tier] > TRUST_SEVERITY[worst] ? tier : worst,
  );
}

// ── Helpers ──────────────────────────────────────────────────

/** Title-cases a kebab-case profile name (e.g. "full-stack-engineer" → "Full Stack Engineer"). */
function toPersona(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Normalises whitespace and truncates to the schema maxLength (256 chars). */
function normaliseDescription(raw: string, max = 256): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  // Trim to max - 1 chars then append ellipsis (U+2026, 1 code point)
  return s.slice(0, max - 1).trimEnd() + "…";
}

// ── Valid v1 harness.yaml builder ────────────────────────────

/**
 * Builds a valid Harness Protocol v1 `harness.yaml` string from a legacy
 * profile YAML (the `components`/`knowledge`/`rules` shape used in profiles/).
 * Uses resolved plugins so the emitted version strings are always the live
 * marketplace version, not a potentially stale pinned version.
 */
export function buildHarnessYaml(
  profile: ProfileYaml,
  resolvedPlugins: Array<{ name: string; version: string }>,
): string {
  const desc = normaliseDescription(profile.description);
  const authorName = profile.author?.name ?? "harnessprotocol";

  const lines: string[] = [
    `version: "1"`,
    `kind: profile`,
    `metadata:`,
    `  name: ${profile.name}`,
    `  description: >-`,
    `    ${desc}`,
    `  author:`,
    `    name: ${authorName}`,
  ];

  if (resolvedPlugins.length > 0) {
    lines.push("plugins:");
    for (const ref of resolvedPlugins) {
      lines.push(`  - name: ${ref.name}`);
      lines.push(`    source: harnessprotocol/harness-kit`);
      lines.push(`    version: "${ref.version}"`);
    }
  }

  const rules = (profile.rules ?? []).filter((r) => r.trim());
  if (rules.length > 0) {
    lines.push("instructions:");
    lines.push("  behavioral: |");
    for (const rule of rules) {
      lines.push(`    - ${rule}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ── GitHub stars fetch ────────────────────────────────────────

/**
 * Fetches the GitHub star count for an `owner/repo`.
 * Returns `undefined` on any error (rate-limit, missing token, offline).
 */
export async function fetchRepoStars(ownerRepo: string): Promise<number | undefined> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "harness-kit-marketplace-data/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);

  try {
    const res = await fetch(`https://api.github.com/repos/${ownerRepo}`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[marketplace-data] GitHub stars fetch failed (${res.status}) for ${ownerRepo}`);
      return undefined;
    }
    const json = (await res.json()) as { stargazers_count?: number };
    return typeof json.stargazers_count === "number" ? json.stargazers_count : undefined;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[marketplace-data] GitHub stars fetch error for ${ownerRepo}: ${msg}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Profile reader ────────────────────────────────────────────

/**
 * Reads all profile YAML files from `<repoRoot>/profiles/`, resolves each
 * component against the live plugin set, and emits a validated
 * `MarketplaceProfile[]` sorted by name.
 *
 * @param strict - When true, throws on unresolved components or invalid YAML.
 *                 When false (default), emits console warnings and continues.
 */
export async function readProfiles(
  repoRoot: string,
  plugins: MarketplacePlugin[],
  strict = false,
): Promise<MarketplaceProfile[]> {
  const profilesDir = join(repoRoot, "profiles");
  let files: string[];
  try {
    const entries = await readdir(profilesDir);
    files = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    // profiles/ directory absent — not an error
    return [];
  }

  const pluginMap = new Map(plugins.map((p) => [p.name, p]));
  const profiles: MarketplaceProfile[] = [];

  for (const file of files) {
    const content = await readFile(join(profilesDir, file), "utf-8");
    const raw = parseYaml(content) as ProfileYaml;

    // ── Resolve components against live plugin set ───────────
    const refs: ProfilePluginRef[] = (raw.components ?? []).map((c) => {
      const plugin = pluginMap.get(c.name);
      if (!plugin) {
        const msg = `Profile "${raw.name}": component "${c.name}" not found in marketplace.json`;
        if (strict) throw new Error(msg);
        console.warn(`[marketplace-data] Warning: ${msg}`);
        return { name: c.name, version: c.version, resolved: false };
      }
      return {
        name: c.name,
        version: c.version,
        liveVersion: plugin.version,
        resolved: true,
        slug: plugin.slug,
        category: plugin.category,
        trust: plugin.security.trust,
      };
    });

    // ── Compute aggregate security trust ─────────────────────
    const resolvedTrusts: TrustTier[] = refs
      .filter((r): r is ProfilePluginRef & { trust: TrustTier } => r.resolved && r.trust !== undefined)
      .map((r) => r.trust);

    // An unresolved ref degrades the aggregate to at least "caution"
    if (refs.some((r) => !r.resolved)) resolvedTrusts.push("caution");

    const aggregateTrust = worstTrust(resolvedTrusts.length > 0 ? resolvedTrusts : ["unscanned"]);

    // ── Build the downloadable v1 harness.yaml ───────────────
    const resolvedForYaml = refs
      .filter((r) => r.resolved)
      .map((r) => ({ name: r.name, version: r.liveVersion ?? r.version }));

    const harnessYaml = buildHarnessYaml(raw, resolvedForYaml);
    const validation = validateHarnessYaml(harnessYaml);
    if (!validation.valid) {
      const errors = validation.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
      const msg = `Profile "${raw.name}": generated harness.yaml is invalid: ${errors}`;
      if (strict) throw new Error(msg);
      console.warn(`[marketplace-data] Warning: ${msg}`);
    }

    // ── Build knowledge and security rollup ──────────────────
    const knowledge: ProfileKnowledge | null = raw.knowledge
      ? {
          backend: raw.knowledge.backend,
          seedDocs: (raw.knowledge.seed_docs ?? []).map((d) => ({
            topic: d.topic,
            description: d.description,
          })),
        }
      : null;

    const security = {
      trust: aggregateTrust,
      pluginCount: refs.length,
      verifiedCount: refs.filter((r) => r.trust === "verified").length,
      cautionCount: refs.filter((r) => r.trust === "caution").length,
      warningCount: refs.filter((r) => r.trust === "warning").length,
      unscannedCount: refs.filter((r) => r.trust === "unscanned" || !r.resolved).length,
    };

    profiles.push({
      name: raw.name,
      slug: raw.name,
      description: normaliseDescription(raw.description),
      author: raw.author?.name ?? "harnessprotocol",
      persona: toPersona(raw.name),
      plugins: refs,
      knowledge,
      rules: raw.rules ?? [],
      harnessYaml,
      aggregateTrust,
      security,
      sourceId: "first-party",
    });
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}
