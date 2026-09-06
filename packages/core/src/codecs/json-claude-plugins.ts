import { isRecord } from "../utils/is-record.js";
import type { MarketplaceValue, PluginInstallScope, PluginStoreValue } from "./plugin-shapes.js";

/**
 * READ-ONLY codec for Claude Code's plugin state (AC-4, design.md §3 D2 —
 * an irregular format handled by code, not the generic JSON executors).
 * Pure string → data: file IO and provenance stamping live in
 * observe/read-store.ts.
 *
 * Two files, both under `~/.claude/plugins/`:
 *
 * - `installed_plugins.json` — `{ version, plugins: { "<name>@<marketplace>":
 *   InstallEntry[] } }`. One identity can carry SEVERAL entries: one per
 *   scope, and one per project for project-local installs. That is why this
 *   is a codec and not a `json-generic` read — the file is user-scoped but
 *   its contents span both scopes (see `mapScope`).
 * - `known_marketplaces.json` — `{ "<id>": { installLocation, lastUpdated,
 *   source } }`.
 *
 * Enablement lives in a THIRD place: `claude plugin enable` / `disable`
 * writes an `enabledPlugins` map into settings, not into the install record,
 * so presence in `installed_plugins.json` means installed and says nothing
 * about active. The store executor reads the settings files named by the
 * descriptor's `enablement` list and passes their merged map in here.
 *
 * Three properties of that map, each verified against `claude plugin list`
 * with an isolated CLAUDE_CONFIG_DIR rather than assumed:
 *
 * 1. An ABSENT key means disabled, not enabled. Deleting one key reports
 *    that plugin as disabled; deleting the whole map reports every install
 *    as disabled. `claude plugin disable` happens to write `false` rather
 *    than removing the key, so an enabled-by-default reading survives the
 *    happy path and fails on a hand-edited or freshly imported settings file.
 * 2. It is ONE map, not one per install scope. A project settings file
 *    disables a USER-scope install when Claude Code runs in that project.
 * 3. `~/.claude/settings.local.json` is NOT consulted — a `true` there does
 *    not override a `false` in `~/.claude/settings.json`. The project-level
 *    `settings.local.json` IS consulted.
 *
 * The `<name>@<marketplace>` identity convention is shared with Codex's
 * `[plugins."name@marketplace"]` tables, so the same plugin installed on
 * both surfaces joins onto one grid row without a translation table.
 */

export interface ClaudePluginEntry {
  name: string;
  scope: PluginInstallScope;
  /** Absolute project path for a project-scope install; absent at user scope. */
  projectPath?: string;
  value: PluginStoreValue;
}

/**
 * Read one settings file's `enabledPlugins` map. Anything that is not a
 * boolean-valued entry under that key is ignored rather than guessed at, and
 * a settings file HarnessKit cannot parse contributes nothing instead of
 * silently reporting every plugin as enabled — the caller reports the parse
 * failure so a wrong-looking grid has a stated reason.
 */
export function readClaudeEnabledPlugins(
  content: string,
): { enabled: Record<string, boolean> } | { reason: string } {
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reason: `is not valid JSON (${message})` };
  }
  if (!isRecord(doc)) return { reason: "root is not a JSON object" };
  const raw = doc.enabledPlugins;
  if (raw === undefined) return { enabled: {} };
  if (!isRecord(raw)) return { reason: "'enabledPlugins' is not a JSON object" };
  const enabled: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "boolean") enabled[key] = value;
  }
  return { enabled };
}

/**
 * The merged `enabledPlugins` map, in precedence order (later file wins),
 * applied to every install regardless of the install's own scope. A plugin
 * absent from it is DISABLED — see property 1 above.
 */
export type ClaudeEnablement = Record<string, boolean>;

export interface ClaudePluginsReadResult {
  entries: ClaudePluginEntry[];
  skipped: Array<{ reason: string }>;
}

/** Human-readable JSON value description for skipped[] reasons. */
function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/**
 * Split `"<name>@<marketplace>"` on the LAST `@`. Plugin names are not
 * allowed to contain `@` today, but splitting from the right keeps a
 * scoped-npm-style name (`@scope/pkg@market`) parsing to the right halves
 * instead of silently producing an empty name.
 */
function splitIdentity(key: string): { name: string; marketplace: string } | null {
  const at = key.lastIndexOf("@");
  if (at <= 0 || at === key.length - 1) return null;
  return { name: key.slice(0, at), marketplace: key.slice(at + 1) };
}

/**
 * Claude Code writes `"user"` and `"local"`; `"local"` is a project-scoped
 * install pinned to `projectPath`. Anything else is a scope this build does
 * not understand — reported, never guessed at.
 */
function mapScope(raw: unknown): PluginInstallScope | null {
  if (raw === "user") return "user";
  if (raw === "local") return "project";
  return null;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Normalize a project root for comparison: backslashes to forward slashes,
 * trailing separators trimmed. The desktop passes a user-TYPED directory
 * through verbatim, and a pasted or tab-completed path carrying a trailing
 * slash would otherwise match nothing and report "no project plugins" with
 * no diagnostic — a silent zero.
 *
 * Case is deliberately NOT folded. macOS and Windows are usually
 * case-insensitive and Linux is not, and folding unconditionally would make
 * two genuinely different roots collide on the platforms where they can
 * coexist. A case-differing root still under-reports; normalizing it belongs
 * to whoever resolves the path, not to this comparison.
 */
function normalizeProjectPath(path: string): string {
  const slashed = path.replace(/\\/g, "/");
  let end = slashed.length;
  while (end > 1 && slashed[end - 1] === "/") end -= 1;
  return slashed.slice(0, end);
}

/**
 * Parse `installed_plugins.json`. Degraded, never thrown: a whole-file parse
 * failure becomes one skipped entry, and per-entry junk is skipped with a
 * reason naming the identity.
 *
 * Project-scope installs are filtered against `projectRoot`:
 * - a string → only entries whose `projectPath` equals it are emitted;
 * - `null` → machine-only observation, project installs are deliberately
 *   dropped without a diagnostic (there is no project to attribute them to);
 * - `undefined` → the caller did not supply project context at all, so any
 *   project-scope install present becomes a skipped diagnostic rather than a
 *   silent omission. Silence here would read as "no project plugins".
 */
export function readClaudePlugins(
  content: string,
  projectRoot: string | null | undefined,
  enablement: ClaudeEnablement = {},
): ClaudePluginsReadResult {
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { entries: [], skipped: [{ reason: `is not valid JSON (${message})` }] };
  }
  if (!isRecord(doc)) {
    return { entries: [], skipped: [{ reason: "root is not a JSON object" }] };
  }
  const plugins = doc.plugins;
  if (plugins === undefined) return { entries: [], skipped: [] };
  if (!isRecord(plugins)) {
    return { entries: [], skipped: [{ reason: "'plugins' is not a JSON object" }] };
  }

  const entries: ClaudePluginEntry[] = [];
  const skipped: Array<{ reason: string }> = [];
  let unattributedProjectInstalls = 0;

  for (const key of Object.keys(plugins).sort()) {
    const identity = splitIdentity(key);
    if (!identity) {
      skipped.push({ reason: `plugin '${key}' is not in '<name>@<marketplace>' form` });
      continue;
    }
    const installs = plugins[key];
    if (!Array.isArray(installs)) {
      skipped.push({ reason: `plugin '${key}' does not hold an array of installs` });
      continue;
    }
    for (const install of installs) {
      if (!isRecord(install)) {
        skipped.push({ reason: `plugin '${key}' has an install that is not an object` });
        continue;
      }
      const scope = mapScope(install.scope);
      if (scope === null) {
        skipped.push({
          reason: `plugin '${key}' has an install with unrecognized scope ${JSON.stringify(install.scope)}`,
        });
        continue;
      }
      const projectPath = stringOrUndefined(install.projectPath);
      if (scope === "project") {
        if (projectRoot === undefined) {
          unattributedProjectInstalls++;
          continue;
        }
        if (projectRoot === null) continue;
        if (
          projectPath === undefined ||
          normalizeProjectPath(projectPath) !== normalizeProjectPath(projectRoot)
        ) {
          continue;
        }
      }
      entries.push({
        name: key,
        scope,
        ...(projectPath !== undefined ? { projectPath } : {}),
        value: {
          marketplace: identity.marketplace,
          name: identity.name,
          // Absent means disabled, and the map is not partitioned by the
          // install's scope — see the properties at the top of this file.
          enabled: enablement[key] === true,
          ...(stringOrUndefined(install.version) !== undefined
            ? { version: stringOrUndefined(install.version) as string }
            : {}),
          ...(stringOrUndefined(install.gitCommitSha) !== undefined
            ? { revision: stringOrUndefined(install.gitCommitSha) as string }
            : {}),
        },
      });
    }
  }

  if (unattributedProjectInstalls > 0) {
    skipped.push({
      reason:
        `${unattributedProjectInstalls} project-scope plugin install(s) were not attributed ` +
        "because the read was made without project context",
    });
  }

  return { entries, skipped };
}

// ── marketplaces ────────────────────────────────────────────────

export interface MarketplacesReadResult {
  entries: MarketplaceValue[];
  skipped: Array<{ reason: string }>;
}

/**
 * Read the `source` block of a Claude Code marketplace entry. Known shapes:
 * `{source: "github", repo}`, `{source: "git", url}`, `{source: "local", path}`.
 * An unknown shape yields the type alone rather than a guessed location.
 */
function readClaudeSource(value: unknown): { sourceType?: string; source?: string } {
  if (!isRecord(value)) return {};
  const sourceType = stringOrUndefined(value.source);
  const source =
    stringOrUndefined(value.repo) ??
    stringOrUndefined(value.url) ??
    stringOrUndefined(value.path);
  return {
    ...(sourceType !== undefined ? { sourceType } : {}),
    ...(source !== undefined ? { source } : {}),
  };
}

/** Parse `known_marketplaces.json`. Degraded, never thrown. */
export function readClaudeMarketplaces(content: string): MarketplacesReadResult {
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { entries: [], skipped: [{ reason: `is not valid JSON (${message})` }] };
  }
  if (!isRecord(doc)) {
    return { entries: [], skipped: [{ reason: "root is not a JSON object" }] };
  }

  const entries: MarketplaceValue[] = [];
  const skipped: Array<{ reason: string }> = [];
  for (const id of Object.keys(doc).sort()) {
    const value = doc[id];
    // Only object values are marketplaces. The sibling installed_plugins.json
    // already carries a top-level `version` number, so a scalar key here is a
    // schema field, not a registered marketplace — reporting beats inventing
    // a phantom marketplace that would show up in the badge and in `status`.
    // The Codex reader in toml-codex.ts applies the same rule.
    if (!isRecord(value)) {
      skipped.push({ reason: `marketplace '${id}' is ${describeValue(value)}, not an object` });
      continue;
    }
    entries.push({ id, ...readClaudeSource(value.source) });
  }
  return { entries, skipped };
}
