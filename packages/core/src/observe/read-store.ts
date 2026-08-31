import type { FsProvider } from "../fs-provider.js";
import type { ConfigStore, StoreFormatId } from "../surfaces/types.js";
import type { HarnessResourceKind } from "../portability/types.js";
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
   * JSON document as-is.
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

/** Value shape for `kind: "skill"` entries — deliberately light, no body. */
export interface SkillStoreValue {
  name: string;
  /** Absolute path of the SKILL.md this entry was read from. */
  skillPath: string;
  description?: string;
}

/** Value shape for `kind: "instructions"` entries. */
export interface InstructionsStoreValue {
  content: string;
}

function empty(): StoreReadResult {
  return { entries: [], skipped: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Read a file's text, treating absence (or unreadability) as null. */
async function readTextIfExists(fs: FsProvider, path: string): Promise<string | null> {
  if (!(await fs.exists(path))) return null;
  try {
    return await fs.readFile(path);
  } catch {
    return null;
  }
}

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
  switch (store.formatId as string) {
    case "json-mcpservers":
      return readJsonMcpServersStore(fs, store, absolutePath);
    case "json-generic":
      return readJsonGenericStore(fs, store, absolutePath);
    case "skills-dir":
      return readSkillsDirStore(fs, store, absolutePath);
    case "markdown-instructions":
      return readMarkdownInstructionsStore(fs, store, absolutePath);
    case "toml-codex":
      return readTomlCodexStore(fs, store, absolutePath);
    case "json-opencode":
      return readJsonOpencodeStore(fs, store, absolutePath);
    default:
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
}

// ── json-mcpservers ─────────────────────────────────────────────

/** Root keys server maps are known to live under across surfaces. */
const KNOWN_SERVER_ROOT_KEYS = ["mcpServers", "servers"] as const;

async function readJsonMcpServersStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
): Promise<StoreReadResult> {
  const raw = await readTextIfExists(fs, absolutePath);
  if (raw === null) return empty();

  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (error) {
    return {
      entries: [],
      skipped: [{ file: absolutePath, reason: `invalid JSON: ${errorMessage(error)}` }],
    };
  }
  if (!isRecord(doc)) {
    return {
      entries: [],
      skipped: [{ file: absolutePath, reason: "expected a JSON object at the top level — skipped." }],
    };
  }

  const rootKey = store.shape?.rootKey ?? "mcpServers";
  const rootValue = doc[rootKey];

  if (rootValue === undefined) {
    // Pinned behavior: an absent root key normally means "no MCP servers
    // configured" (e.g. a ~/.claude.json with no mcpServers key) — empty,
    // no skipped noise. But when the servers clearly live under the OTHER
    // well-known root key, the store shape is wrong for this file and
    // staying silent would hide it — report it via skipped[].
    const sibling = KNOWN_SERVER_ROOT_KEYS.find(
      (key) => key !== rootKey && isRecord(doc[key]) && Object.keys(doc[key] as object).length > 0,
    );
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
        { file: absolutePath, reason: `root key '${rootKey}' is not an object — skipped.` },
      ],
    };
  }

  const entries: StoreEntry[] = [];
  const skipped: SkippedEntry[] = [];
  for (const [name, entry] of Object.entries(rootValue)) {
    const reversed = isRecord(entry) ? reverseTranslateServer(entry as McpJsonEntry) : null;
    if (!reversed) {
      const type = isRecord(entry) ? ((entry as McpJsonEntry).type ?? "stdio") : typeof entry;
      skipped.push({
        file: absolutePath,
        reason: `mcp server '${name}' has an unrecognized or incomplete shape (type: ${type}) — skipped, not observed.`,
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
  const raw = await readTextIfExists(fs, absolutePath);
  if (raw === null) return empty();

  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (error) {
    return {
      entries: [],
      skipped: [{ file: absolutePath, reason: `invalid JSON: ${errorMessage(error)}` }],
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
  for (const dirEntry of [...dirEntries].sort()) {
    const skillDir = fs.joinPath(absolutePath, dirEntry);
    if (!(await fs.isDirectory(skillDir))) continue;
    const skillPath = fs.joinPath(skillDir, "SKILL.md");
    if (!(await fs.exists(skillPath))) continue;

    const content = await fs.readFile(skillPath);
    const name = frontmatterName(content, dirEntry);
    const description = frontmatterDescription(content);
    const value: SkillStoreValue = {
      name,
      skillPath,
      ...(description ? { description } : {}),
    };
    entries.push({
      kind: store.kind,
      name,
      value,
      provenance: { file: skillPath, formatId: store.formatId },
    });
  }
  return { entries, skipped: [] };
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
    for (const dirEntry of [...dirEntries].sort()) {
      if (!INSTRUCTION_FILE_PATTERN.test(dirEntry)) continue;
      const filePath = fs.joinPath(absolutePath, dirEntry);
      if (await fs.isDirectory(filePath)) continue;
      const content = await fs.readFile(filePath);
      const value: InstructionsStoreValue = { content };
      entries.push({
        kind: store.kind,
        name: dirEntry,
        value,
        provenance: { file: filePath, formatId: store.formatId },
      });
    }
    return { entries, skipped: [] };
  }

  const content = await readTextIfExists(fs, absolutePath);
  if (content === null) return empty();
  const value: InstructionsStoreValue = { content };
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
  const raw = await readTextIfExists(fs, absolutePath);
  if (raw === null) return empty();

  const result = readCodexMcp(raw);
  return stampCodecResult(result, store, absolutePath);
}

async function readJsonOpencodeStore(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
): Promise<StoreReadResult> {
  const raw = await readTextIfExists(fs, absolutePath);
  if (raw === null) return empty();

  const result = readOpenCodeMcpConfig(raw);
  return stampCodecResult(result, store, absolutePath);
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
