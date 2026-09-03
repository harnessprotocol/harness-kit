import type { FsProvider } from "../fs-provider.js";
import type {
  ConfigStore,
  MarketplaceFormatId,
  MarketplaceStore,
  StoreFormatId,
  SurfaceScope,
} from "../surfaces/types.js";
import type { HarnessResourceKind } from "../portability/types.js";
import { isRecord } from "../utils/is-record.js";
import { reverseTranslateServer, type McpJsonEntry } from "../import/read-mcp.js";
import { frontmatterName, frontmatterDescription } from "../import/read-skills.js";
import { readCodexMarketplaces, readCodexMcp, readCodexPlugins } from "../codecs/toml-codex.js";
import { readOpenCodeMcpConfig } from "../codecs/json-opencode.js";
import {
  readClaudeEnabledPlugins,
  readClaudeMarketplaces,
  readClaudePlugins,
} from "../codecs/json-claude-plugins.js";
import type { ClaudeEnablement } from "../codecs/json-claude-plugins.js";
import type { MarketplaceValue } from "../codecs/plugin-shapes.js";

/**
 * Read side of surface observation (design.md §3): given a ConfigStore from
 * the Surface registry and a resolved absolute path, produce the store's raw
 * contents in a normalized intermediate shape. Per-surface orchestration is
 * Task 8; normalization/digests are Task 9 — this module only reads.
 *
 * Contract:
 * - Absence is "not configured": a missing file or directory yields
 *   `{entries: [], skipped: []}`, NEVER an error.
 * - A file that exists but cannot be read (e.g. a macOS TCC-blocked Library
 *   path) is NOT absence — it degrades to a skipped diagnostic.
 * - Degraded, never crashed: malformed content and unknown formatIds become
 *   skipped[] diagnostics with human-readable reasons.
 * - All IO goes through FsProvider — no direct node:fs.
 */

/** One raw resource read out of a config store. */
export interface StoreEntry {
  kind: HarnessResourceKind;
  name: string;
  /**
   * Shape per kind: mcp-server → McpServer-ish (CodexMcpValue /
   * OpenCodeMcpValue for the codec formats); skill → SkillStoreValue;
   * instructions → InstructionsStoreValue; json-generic stores → the parsed
   * JSON object as-is.
   */
  value: unknown;
  provenance: { file: string; formatId: StoreFormatId };
  /**
   * Overrides the store's declared scope for THIS entry. Set only by stores
   * whose single file records entries of both scopes — Claude Code's
   * user-scoped `installed_plugins.json` holds project-local installs too.
   * Absent means the entry takes the store's scope, as every other format
   * does.
   */
  scope?: SurfaceScope;
}

/** Something the executor looked at but could not observe, with why. */
export interface SkippedEntry {
  file: string;
  reason: string;
}

export interface StoreReadResult {
  entries: StoreEntry[];
  skipped: SkippedEntry[];
}

/** Value shape for `kind: "skill"` entries. */
export interface SkillStoreValue {
  name: string;
  /** Absolute path of the SKILL.md this entry was read from. */
  skillPath: string;
  description?: string;
  /**
   * Full SKILL.md text, verbatim (frontmatter included) — Task 9 normalizes
   * on the body + frontmatter without re-doing IO.
   */
  content: string;
}

/** Value shape for `kind: "instructions"` entries. */
export interface InstructionsStoreValue {
  content: string;
}

function empty(): StoreReadResult {
  return { entries: [], skipped: [] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Human-readable JSON value description for skipped[] reasons. */
function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/** Last path segment, tolerating both posix and win32 separators. */
function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

const UNREADABLE = "exists but could not be read";

/**
 * DoS hardening: cap on how large a config file readText will accept. A
 * config store is JSON/TOML/markdown measured in KB; anything past this cap
 * is not a config file we should slurp into memory and hash — it degrades
 * to a skipped "file too large" diagnostic instead.
 */
export const MAX_STORE_FILE_BYTES = 5 * 1024 * 1024;

type ReadTextResult =
  | { status: "ok"; content: string }
  | { status: "missing" }
  | { status: "unreadable"; reason: string };

/**
 * Read a file's text, distinguishing absence (not configured) from
 * exists-but-unreadable (a diagnostic — e.g. macOS TCC denying access to a
 * Library path).
 */
async function readText(fs: FsProvider, path: string): Promise<ReadTextResult> {
  if (!(await fs.exists(path))) return { status: "missing" };
  let content: string;
  try {
    content = await fs.readFile(path);
  } catch (error) {
    return { status: "unreadable", reason: `${UNREADABLE}: ${errorMessage(error)}` };
  }
  if (content.length > MAX_STORE_FILE_BYTES) {
    return {
      status: "unreadable",
      reason: `file too large (${content.length} bytes > ${MAX_STORE_FILE_BYTES} byte cap) — skipped.`,
    };
  }
  return { status: "ok", content };
}

/**
 * Runtime context a few formats need beyond their own file contents.
 * Deliberately NOT part of `ConfigStore`: a descriptor is pure data compiled
 * into the definitions bundle, while this is per-run machine state.
 */
export interface StoreReadContext {
  /**
   * Project root, for formats whose user-scoped file records project-scoped
   * entries keyed by project path. `null` = machine-only observation with no
   * project.
   *
   * The key may also be OMITTED, which such a format reports as a diagnostic
   * rather than as "none". No caller inside this repo omits it — both
   * `observeSurface` and `planCellAction` always spread it from
   * `ObserveOptions`, where it is required. The optionality guards
   * `readStore` as an EXPORTED api: an outside caller passing `{}` should get
   * a stated reason, not a confident zero. Treat the branch as API
   * hardening, not as a path production takes.
   */
  projectRoot?: string | null;
  /** Home directory, used to strip the machine owner's username from
   * absolute paths a surface records (see `relativizeHome`). */
  homeRoot?: string;
}

type StoreExecutor = (
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
  context: StoreReadContext,
) => Promise<StoreReadResult>;

/**
 * Exhaustive executor table: adding a StoreFormatId member without an
 * executor fails to compile. readStore looks the formatId up as a raw
 * string, so an unknown id from a newer definitions bundle still degrades
 * to a skipped diagnostic at runtime.
 */
const EXECUTORS: Record<StoreFormatId, StoreExecutor> = {
  "json-mcpservers": readJsonMcpServersStore,
  "json-generic": readJsonGenericStore,
  "skills-dir": readSkillsDirStore,
  "markdown-instructions": readMarkdownInstructionsStore,
  "toml-codex": readTomlCodexStore,
  "json-opencode": readJsonOpencodeStore,
  "json-claude-plugins": readClaudePluginsStore,
  "toml-codex-plugins": readCodexPluginsStore,
};

/**
 * Read one config store at its resolved absolute path into raw entries.
 * Dispatches on the store's formatId; an unknown formatId (a definitions
 * bundle newer than this build) degrades to a skipped diagnostic.
 */
export async function readStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
  context: StoreReadContext = {},
): Promise<StoreReadResult> {
  const executor = (EXECUTORS as Partial<Record<string, StoreExecutor>>)[store.formatId];
  if (!executor) {
    return {
      entries: [],
      skipped: [
        {
          file: absolutePath,
          reason: `no executor for formatId '${store.formatId}' — this store needs a newer app version to observe.`,
        },
      ],
    };
  }
  return executor(fs, store, absolutePath, context);
}

// ── json-mcpservers ─────────────────────────────────────────────

/** Root keys server maps are known to live under across surfaces. */
const KNOWN_SERVER_ROOT_KEYS = ["mcpServers", "servers"] as const;

/** Whether a value plausibly is one MCP server config. */
function looksMcpShaped(value: unknown): boolean {
  return isRecord(value) && ("command" in value || "url" in value || "type" in value);
}

async function readJsonMcpServersStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
): Promise<StoreReadResult> {
  const read = await readText(fs, absolutePath);
  if (read.status === "missing") return empty();
  if (read.status === "unreadable") {
    return { entries: [], skipped: [{ file: absolutePath, reason: read.reason }] };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(read.content);
  } catch (error) {
    return {
      entries: [],
      skipped: [{ file: absolutePath, reason: `invalid JSON: ${errorMessage(error)}` }],
    };
  }
  if (!isRecord(doc)) {
    return {
      entries: [],
      skipped: [
        {
          file: absolutePath,
          reason: `expected a JSON object at the top level, got ${describeValue(doc)} — skipped.`,
        },
      ],
    };
  }

  const rootKey = store.shape?.rootKey ?? "mcpServers";
  const rootValue = doc[rootKey];

  if (rootValue === undefined) {
    // Pinned behavior: an absent root key normally means "no MCP servers
    // configured" (e.g. a ~/.claude.json with no mcpServers key) — empty,
    // no skipped noise. But when at least one MCP-shaped server clearly
    // lives under the OTHER well-known root key, the store shape is wrong
    // for this file and staying silent would hide it — report via skipped[].
    const sibling = KNOWN_SERVER_ROOT_KEYS.find((key) => {
      if (key === rootKey) return false;
      const candidate = doc[key];
      return isRecord(candidate) && Object.values(candidate).some(looksMcpShaped);
    });
    if (sibling) {
      return {
        entries: [],
        skipped: [
          {
            file: absolutePath,
            reason: `expected mcp servers under root key '${rootKey}' but found them under '${sibling}' — wrong shape for this store, skipped.`,
          },
        ],
      };
    }
    return empty();
  }

  if (!isRecord(rootValue)) {
    return {
      entries: [],
      skipped: [
        {
          file: absolutePath,
          reason: `root key '${rootKey}' is not an object (got ${describeValue(rootValue)}) — skipped.`,
        },
      ],
    };
  }

  const entries: StoreEntry[] = [];
  const skipped: SkippedEntry[] = [];
  for (const [name, entry] of Object.entries(rootValue)) {
    if (!isRecord(entry)) {
      skipped.push({
        file: absolutePath,
        reason: `mcp server '${name}' is not an object (got ${describeValue(entry)}) — skipped, not observed.`,
      });
      continue;
    }
    const reversed = reverseTranslateServer(entry as McpJsonEntry);
    if (!reversed) {
      skipped.push({
        file: absolutePath,
        reason: `mcp server '${name}' has an unrecognized or incomplete shape (type: ${(entry as McpJsonEntry).type ?? "stdio"}) — skipped, not observed.`,
      });
      continue;
    }
    entries.push({
      kind: store.kind,
      name,
      value: reversed,
      provenance: { file: absolutePath, formatId: store.formatId },
    });
  }
  return { entries, skipped };
}

// ── json-generic ────────────────────────────────────────────────

async function readJsonGenericStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
): Promise<StoreReadResult> {
  const read = await readText(fs, absolutePath);
  if (read.status === "missing") return empty();
  if (read.status === "unreadable") {
    return { entries: [], skipped: [{ file: absolutePath, reason: read.reason }] };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(read.content);
  } catch (error) {
    return {
      entries: [],
      skipped: [{ file: absolutePath, reason: `invalid JSON: ${errorMessage(error)}` }],
    };
  }

  // Pinned behavior: json-generic stores are settings-style documents — the
  // top level must be an object. A scalar, null, or array is reported, not
  // wrapped into an entry that downstream code would choke on.
  if (!isRecord(doc)) {
    return {
      entries: [],
      skipped: [
        {
          file: absolutePath,
          reason: `expected a JSON object at the top level, got ${describeValue(doc)} — skipped.`,
        },
      ],
    };
  }

  return {
    entries: [
      {
        kind: store.kind,
        name: store.kind,
        value: doc,
        provenance: { file: absolutePath, formatId: store.formatId },
      },
    ],
    skipped: [],
  };
}

// ── skills-dir ──────────────────────────────────────────────────

async function readSkillsDirStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
): Promise<StoreReadResult> {
  if (!(await fs.exists(absolutePath))) return empty();

  let dirEntries: string[];
  try {
    dirEntries = await fs.readDir(absolutePath);
  } catch {
    return empty();
  }

  const entries: StoreEntry[] = [];
  const skipped: SkippedEntry[] = [];
  for (const dirEntry of [...dirEntries].sort()) {
    const skillDir = fs.joinPath(absolutePath, dirEntry);
    if (!(await fs.isDirectory(skillDir))) continue;
    const skillPath = fs.joinPath(skillDir, "SKILL.md");
    if (!(await fs.exists(skillPath))) continue;

    const read = await readText(fs, skillPath);
    if (read.status === "missing") continue;
    if (read.status === "unreadable") {
      skipped.push({ file: skillPath, reason: read.reason });
      continue;
    }
    const content = read.content;
    const name = frontmatterName(content, dirEntry);
    const description = frontmatterDescription(content);
    const value: SkillStoreValue = {
      name,
      skillPath,
      ...(description ? { description } : {}),
      content,
    };
    entries.push({
      kind: store.kind,
      name,
      value,
      provenance: { file: skillPath, formatId: store.formatId },
    });
  }
  return { entries, skipped };
}

// ── markdown-instructions ───────────────────────────────────────

const INSTRUCTION_FILE_PATTERN = /\.(md|mdc)$/i;

async function readMarkdownInstructionsStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
): Promise<StoreReadResult> {
  if (store.shape?.directory) {
    // A directory of rule files (e.g. Cursor's .cursor/rules): every *.md
    // and *.mdc directly inside it, non-recursive, one entry per file.
    if (!(await fs.exists(absolutePath))) return empty();

    let dirEntries: string[];
    try {
      dirEntries = await fs.readDir(absolutePath);
    } catch {
      return empty();
    }

    const entries: StoreEntry[] = [];
    const skipped: SkippedEntry[] = [];
    for (const dirEntry of [...dirEntries].sort()) {
      if (!INSTRUCTION_FILE_PATTERN.test(dirEntry)) continue;
      const filePath = fs.joinPath(absolutePath, dirEntry);
      if (await fs.isDirectory(filePath)) continue;
      const read = await readText(fs, filePath);
      if (read.status === "missing") continue;
      if (read.status === "unreadable") {
        skipped.push({ file: filePath, reason: read.reason });
        continue;
      }
      const value: InstructionsStoreValue = { content: read.content };
      entries.push({
        kind: store.kind,
        name: dirEntry,
        value,
        provenance: { file: filePath, formatId: store.formatId },
      });
    }
    return { entries, skipped };
  }

  const read = await readText(fs, absolutePath);
  if (read.status === "missing") return empty();
  if (read.status === "unreadable") {
    return { entries: [], skipped: [{ file: absolutePath, reason: read.reason }] };
  }
  const value: InstructionsStoreValue = { content: read.content };
  return {
    entries: [
      {
        kind: store.kind,
        name: basename(absolutePath),
        value,
        provenance: { file: absolutePath, formatId: store.formatId },
      },
    ],
    skipped: [],
  };
}

// ── codec dispatch (toml-codex / json-opencode) ─────────────────

async function readTomlCodexStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
): Promise<StoreReadResult> {
  const read = await readText(fs, absolutePath);
  if (read.status === "missing") return empty();
  if (read.status === "unreadable") {
    return { entries: [], skipped: [{ file: absolutePath, reason: read.reason }] };
  }
  return stampCodecResult(readCodexMcp(read.content), store, absolutePath);
}

async function readJsonOpencodeStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
): Promise<StoreReadResult> {
  const read = await readText(fs, absolutePath);
  if (read.status === "missing") return empty();
  if (read.status === "unreadable") {
    return { entries: [], skipped: [{ file: absolutePath, reason: read.reason }] };
  }
  return stampCodecResult(readOpenCodeMcpConfig(read.content), store, absolutePath);
}

/** Attach kind + provenance to a pure codec result. */
function stampCodecResult(
  result: {
    entries: Array<{ name: string; value: unknown }>;
    skipped: Array<{ reason: string }>;
  },
  store: ConfigStore,
  absolutePath: string,
): StoreReadResult {
  return {
    entries: result.entries.map(({ name, value }) => ({
      kind: store.kind,
      name,
      value,
      provenance: { file: absolutePath, formatId: store.formatId },
    })),
    skipped: result.skipped.map(({ reason }) => ({ file: absolutePath, reason })),
  };
}

// ── plugins and marketplaces (AC-4) ─────────────────────────────

/**
 * Replace a leading home directory with `~` so an absolute path a surface
 * recorded (Codex writes `/Users/<name>/.codex/.tmp/…` for its bundled
 * marketplaces) does not carry the machine owner's username into inventory
 * output, grid state, or anything exported from them. Paths outside home,
 * and every non-path source (a repo slug, an https URL), pass through
 * untouched.
 */
export function relativizeHome(value: string, homeRoot: string | undefined): string {
  if (homeRoot === undefined || homeRoot.length === 0) return value;
  // Separator-agnostic: `platform: "win32"` is a supported observation target
  // and `write-scope.json` carries a full win32 section, so a POSIX-only
  // match would leave the username in place on exactly the platform whose
  // home paths (`C:\\Users\\<name>`) contain it most prominently.
  const trimSeparators = (path: string): string => {
    let end = path.length;
    while (end > 0 && (path[end - 1] === "/" || path[end - 1] === "\\")) end -= 1;
    return path.slice(0, end);
  };
  const root = trimSeparators(homeRoot);
  if (root.length === 0) return value;
  if (trimSeparators(value) === root) return "~";
  const next = value[root.length];
  if (value.startsWith(root) && (next === "/" || next === "\\")) {
    return `~${value.slice(root.length)}`;
  }
  return value;
}

/**
 * Resolve and merge the `enabledPlugins` maps the store's descriptor names.
 * Later files override earlier ones within a scope, which is how Claude Code
 * layers `settings.local.json` over `settings.json`. A file that exists but
 * cannot be read or parsed produces a diagnostic rather than being treated as
 * "nothing disabled" — otherwise a corrupt settings file would silently
 * report every plugin as active.
 */
async function readEnablement(
  fs: FsProvider,
  store: ConfigStore,
  context: StoreReadContext,
): Promise<{ enablement: ClaudeEnablement; skipped: SkippedEntry[] }> {
  const enablement: ClaudeEnablement = {};
  const skipped: SkippedEntry[] = [];
  for (const source of store.enablement ?? []) {
    const root = source.scope === "user" ? context.homeRoot : context.projectRoot;
    if (root === undefined || root === null) continue;
    const path = fs.joinPath(root, source.path);
    const read = await readText(fs, path);
    if (read.status === "missing") continue;
    if (read.status === "unreadable") {
      skipped.push({ file: path, reason: read.reason });
      continue;
    }
    const parsed = readClaudeEnabledPlugins(read.content);
    if ("reason" in parsed) {
      skipped.push({
        file: path,
        reason: `${parsed.reason} — plugin enable/disable state could not be read from it`,
      });
      continue;
    }
    enablement[source.scope] = { ...enablement[source.scope], ...parsed.enabled };
  }
  return { enablement, skipped };
}

async function readClaudePluginsStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
  context: StoreReadContext,
): Promise<StoreReadResult> {
  const read = await readText(fs, absolutePath);
  if (read.status === "missing") return empty();
  if (read.status === "unreadable") {
    return { entries: [], skipped: [{ file: absolutePath, reason: read.reason }] };
  }
  // "projectRoot" in context distinguishes an explicit null (machine-only:
  // drop project installs silently) from an absent key (no project context
  // was supplied: report rather than imply "none").
  const projectRoot = "projectRoot" in context ? context.projectRoot : undefined;
  const enablement = await readEnablement(fs, store, context);
  const result = readClaudePlugins(read.content, projectRoot, enablement.enablement);
  return {
    entries: result.entries.map((entry) => ({
      kind: store.kind,
      name: entry.name,
      value: entry.value,
      provenance: { file: absolutePath, formatId: store.formatId },
      scope: entry.scope,
    })),
    skipped: [
      ...result.skipped.map(({ reason }) => ({ file: absolutePath, reason })),
      ...enablement.skipped,
    ],
  };
}

async function readCodexPluginsStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
): Promise<StoreReadResult> {
  const read = await readText(fs, absolutePath);
  if (read.status === "missing") return empty();
  if (read.status === "unreadable") {
    return { entries: [], skipped: [{ file: absolutePath, reason: read.reason }] };
  }
  return stampCodecResult(readCodexPlugins(read.content), store, absolutePath);
}

/** One registered marketplace with where it was read from. */
export interface MarketplaceEntry extends MarketplaceValue {
  scope: SurfaceScope;
  provenance: { file: string; formatId: MarketplaceFormatId };
}

export interface MarketplaceReadResult {
  entries: MarketplaceEntry[];
  skipped: SkippedEntry[];
}

type MarketplaceReader = (content: string) => {
  entries: MarketplaceValue[];
  skipped: Array<{ reason: string }>;
};

/** Exhaustive reader table: adding a MarketplaceFormatId without a reader
 * fails to compile. */
const MARKETPLACE_READERS: Record<MarketplaceFormatId, MarketplaceReader> = {
  "json-claude-marketplaces": readClaudeMarketplaces,
  "toml-codex-marketplaces": readCodexMarketplaces,
};

/**
 * Read one marketplace store at its resolved absolute path (AC-4). Same
 * contract as readStore: absence is "none registered", unreadable is a
 * diagnostic, an unknown formatId degrades rather than throwing.
 */
export async function readMarketplaceStore(
  fs: FsProvider,
  store: MarketplaceStore,
  absolutePath: string,
  context: StoreReadContext = {},
): Promise<MarketplaceReadResult> {
  const reader = (MARKETPLACE_READERS as Partial<Record<string, MarketplaceReader>>)[
    store.formatId
  ];
  if (!reader) {
    return {
      entries: [],
      skipped: [
        {
          file: absolutePath,
          reason: `no reader for marketplace formatId '${store.formatId}' — this store needs a newer app version to observe.`,
        },
      ],
    };
  }
  const read = await readText(fs, absolutePath);
  if (read.status === "missing") return { entries: [], skipped: [] };
  if (read.status === "unreadable") {
    return { entries: [], skipped: [{ file: absolutePath, reason: read.reason }] };
  }
  const result = reader(read.content);
  return {
    entries: result.entries.map((value) => ({
      ...value,
      ...(value.source !== undefined
        ? { source: relativizeHome(value.source, context.homeRoot) }
        : {}),
      scope: store.scope,
      provenance: { file: absolutePath, formatId: store.formatId },
    })),
    skipped: result.skipped.map(({ reason }) => ({ file: absolutePath, reason })),
  };
}
