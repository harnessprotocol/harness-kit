import type { FsProvider } from "../fs-provider.js";
import type { ConfigStore, StoreFormatId } from "../surfaces/types.js";
import type { HarnessResourceKind } from "../portability/types.js";
import { isRecord } from "../utils/is-record.js";
import { reverseTranslateServer, type McpJsonEntry } from "../import/read-mcp.js";
import { frontmatterName, frontmatterDescription } from "../import/read-skills.js";
import { readCodexMcp } from "../codecs/toml-codex.js";
import { readOpenCodeMcpConfig } from "../codecs/json-opencode.js";

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

type StoreExecutor = (
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
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
  return executor(fs, store, absolutePath);
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
