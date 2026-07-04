import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { validateHarnessYaml } from "@harness-kit/core";
import type { HarnessConfig } from "@harness-kit/core";
import type {
  MarketplacePlugin,
  MarketplaceProfile,
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

/**
 * Derives a flat "workflow rules" list from a profile's `instructions.operational`
 * block, for the website's rules display. Reads bullet lines ("- ...") and folds
 * wrapped continuation lines back into the bullet they belong to. This is a
 * read-only view for display — the instructions text itself is the source of truth.
 */
function extractRules(operational: string | null | undefined): string[] {
  if (!operational) return [];
  const rules: string[] = [];
  for (const rawLine of operational.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("- ")) {
      rules.push(line.slice(2).trim());
    } else if (rules.length > 0) {
      rules[rules.length - 1] += ` ${line}`;
    }
  }
  return rules;
}

// ── Valid v1 harness.yaml builder ────────────────────────────

/**
 * Re-serializes a profile's `plugins` list, substituting each resolved plugin's
 * LIVE marketplace version for whatever version the profile pins, so a
 * downloaded harness.yaml always installs current plugin versions rather than a
 * potentially stale pin. Every other section (metadata, instructions,
 * mcp-servers, permissions, env, extends) is carried through unchanged.
 */
export function buildHarnessYaml(
  profile: HarnessConfig,
  resolvedPlugins: Array<{ name: string; version: string }>,
): string {
  const liveVersion = new Map(resolvedPlugins.map((p) => [p.name, p.version]));
  const plugins = (profile.plugins ?? [])
    .filter((p) => liveVersion.has(p.name))
    .map((p) => ({ ...p, version: liveVersion.get(p.name)! }));

  const output: HarnessConfig = { ...profile };
  if (output.metadata) {
    output.metadata = {
      ...output.metadata,
      description: normaliseDescription(output.metadata.description),
    };
  }
  if (plugins.length > 0) {
    output.plugins = plugins;
  } else {
    delete output.plugins;
  }

  return stringifyYaml(output, { lineWidth: 0 });
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
 * Reads all profile YAML files from `<repoRoot>/profiles/` — real `kind: profile`
 * Harness Protocol v1 documents — resolves each plugin against the live plugin
 * set, and emits a validated `MarketplaceProfile[]` sorted by name.
 *
 * @param strict - When true, throws on invalid source YAML or an unresolved
 *                 plugin. When false (default), emits console warnings and continues.
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
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // profiles/ directory absent — not an error
      return [];
    }
    throw err; // Permission denied, I/O error, etc. — surface it
  }

  const pluginMap = new Map(plugins.map((p) => [p.name, p]));
  const profiles: MarketplaceProfile[] = [];

  for (const file of files) {
    const content = await readFile(join(profilesDir, file), "utf-8");

    const sourceValidation = validateHarnessYaml(content);
    if (!sourceValidation.valid) {
      const errors = sourceValidation.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
      const msg = `Profile "${file}": source YAML is invalid: ${errors}`;
      if (strict) throw new Error(msg);
      console.warn(`[marketplace-data] Warning: ${msg}`);
    }

    const raw = parseYaml(content) as HarnessConfig;
    const name = raw.metadata?.name ?? file.replace(/\.ya?ml$/, "");
    const description = normaliseDescription(raw.metadata?.description ?? "");
    const author = raw.metadata?.author?.name ?? "harnessprotocol";

    // ── Resolve plugins against live plugin set ───────────
    const refs: ProfilePluginRef[] = (raw.plugins ?? []).map((p) => {
      const plugin = pluginMap.get(p.name);
      if (!plugin) {
        const msg = `Profile "${name}": plugin "${p.name}" not found in marketplace.json`;
        if (strict) throw new Error(msg);
        console.warn(`[marketplace-data] Warning: ${msg}`);
        return { name: p.name, version: p.version ?? "0.0.0", resolved: false };
      }
      return {
        name: p.name,
        version: p.version ?? plugin.version,
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
      const msg = `Profile "${name}": generated harness.yaml is invalid: ${errors}`;
      if (strict) throw new Error(msg);
      console.warn(`[marketplace-data] Warning: ${msg}`);
    }

    // ── Security rollup ───────────────────────────────────────
    const security = {
      trust: aggregateTrust,
      pluginCount: refs.length,
      verifiedCount: refs.filter((r) => r.trust === "verified").length,
      // Unresolved refs degrade the aggregate to "caution" (see aggregateTrust logic above),
      // so count them under cautionCount to keep the headline and breakdown consistent.
      cautionCount: refs.filter((r) => r.trust === "caution" || !r.resolved).length,
      warningCount: refs.filter((r) => r.trust === "warning").length,
      unscannedCount: refs.filter((r) => r.trust === "unscanned").length,
    };

    profiles.push({
      name,
      slug: name,
      description,
      author,
      persona: toPersona(name),
      plugins: refs,
      // Retired: spec-conformant profiles convey memory/knowledge behavior via
      // the `membrain` plugin + `instructions`, not a bespoke knowledge block
      // (the Harness Protocol v1 schema has no `knowledge` key).
      knowledge: null,
      rules: extractRules(raw.instructions?.operational),
      harnessYaml,
      aggregateTrust,
      security,
      sourceId: "first-party",
    });
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}
