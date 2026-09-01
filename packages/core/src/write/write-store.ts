import { translateServer } from "../adapters/opencode/config-file.js";
import { writeCodexMcp } from "../codecs/toml-codex.js";
import type { CodexMcpValue } from "../codecs/toml-codex.js";
import { appendMarkerBlock, findMarkerBlock, replaceMarkerBlock } from "../compile/markers.js";
import { translateServer as translateMcpJson } from "../compile/mcp-servers.js";
import type { FsProvider } from "../fs-provider.js";
import type { HarnessResourceKind } from "../portability/types.js";
import type { ConfigStore, StoreFormatId } from "../surfaces/types.js";
import type { McpServer } from "../types.js";
import { isRecord } from "../utils/is-record.js";
import type { InstructionsStoreValue, SkillStoreValue } from "../observe/read-store.js";

/**
 * Write executors: the mirror of observe/read-store.ts (AC-12, AC-13).
 *
 * Same posture as the read side, inverted where it matters:
 * - Pure planning. Nothing here mutates the filesystem — an executor returns
 *   the (path, before, after) triples the transaction engine will apply, so
 *   the caller can preview, diff, and gate on them first.
 * - Never a dead cell: a kind or format with no writer returns
 *   `{supported: false, reason}` so the UI can still offer the CLI and
 *   agent-prompt actions, rather than throwing.
 * - Tier-one only this milestone: mcp-server, skill, instructions. `plugin`
 *   waits for M3's broker.
 */

/** One resource-level edit. `value: null` removes. */
export interface StoreEdit {
  kind: HarnessResourceKind;
  name: string;
  value: unknown | null;
}

/** A file the transaction engine should write, with its verified preimage. */
export interface PlannedFileChange {
  /** Absolute path — the caller rebases it onto a transaction root. */
  path: string;
  before: string | null;
  after: string | null;
}

export type StoreWritePlan =
  | { supported: true; changes: PlannedFileChange[] }
  | { supported: false; reason: string };

/** The marker identity cross-surface instruction syncs own. */
const MARKER_NAME = "sync";

const TIER_ONE: ReadonlySet<HarnessResourceKind> = new Set([
  "mcp-server",
  "skill",
  "instructions",
]);

function unsupported(reason: string): StoreWritePlan {
  return { supported: false, reason };
}

/** Read a store's current bytes, or null when it does not exist yet. */
async function readBefore(fs: FsProvider, path: string): Promise<string | null> {
  if (!(await fs.exists(path))) return null;
  try {
    return await fs.readFile(path);
  } catch {
    return null;
  }
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Reject a name that would escape its directory or collide with a path. */
function isSafeSegment(name: string): boolean {
  return name.length > 0 && !name.includes("/") && !name.includes("\\") && name !== "." && name !== "..";
}

// ── json-mcpservers ─────────────────────────────────────────────

const DEFAULT_ROOT_KEY = "mcpServers";

async function writeJsonMcpServers(
  fs: FsProvider,
  store: ConfigStore,
  path: string,
  edit: StoreEdit,
): Promise<StoreWritePlan> {
  const before = await readBefore(fs, path);
  let doc: unknown = {};
  if (before !== null && before.trim().length > 0) {
    try {
      doc = JSON.parse(before);
    } catch (error) {
      // Refuse rather than clobber: the user's file parses for them even if
      // not for us, and overwriting it would lose real configuration.
      return unsupported(
        `${path} is not valid JSON (${error instanceof Error ? error.message : String(error)}) — fix it before syncing into it.`,
      );
    }
  }
  if (!isRecord(doc)) return unsupported(`${path} is not a JSON object.`);

  const rootKey = store.shape?.rootKey ?? DEFAULT_ROOT_KEY;
  const existing = doc[rootKey];
  const servers = isRecord(existing) ? { ...existing } : {};
  if (edit.value === null) delete servers[edit.name];
  // The portable shape keys transport as `transport`; the native file keys it
  // as `type`. Writing the portable value verbatim would leak an internal
  // field into the user's config.
  else servers[edit.name] = translateMcpJson(edit.value as McpServer);

  return {
    supported: true,
    changes: [{ path, before, after: serializeJson({ ...doc, [rootKey]: servers }) }],
  };
}

// ── toml-codex ──────────────────────────────────────────────────

async function writeTomlCodex(
  fs: FsProvider,
  _store: ConfigStore,
  path: string,
  edit: StoreEdit,
): Promise<StoreWritePlan> {
  const before = await readBefore(fs, path);
  try {
    const after = writeCodexMcp(
      before ?? "",
      edit.value === null
        ? { remove: edit.name }
        : { upsert: { name: edit.name, value: edit.value as CodexMcpValue } },
    );
    return { supported: true, changes: [{ path, before, after }] };
  } catch (error) {
    return unsupported(error instanceof Error ? error.message : String(error));
  }
}

// ── json-opencode ───────────────────────────────────────────────

async function writeJsonOpencode(
  fs: FsProvider,
  _store: ConfigStore,
  path: string,
  edit: StoreEdit,
): Promise<StoreWritePlan> {
  const before = await readBefore(fs, path);
  let doc: unknown = {};
  if (before !== null && before.trim().length > 0) {
    try {
      doc = JSON.parse(before);
    } catch (error) {
      return unsupported(
        `${path} is not valid JSON (${error instanceof Error ? error.message : String(error)}) — fix it before syncing into it.`,
      );
    }
  }
  if (!isRecord(doc)) return unsupported(`${path} is not a JSON object.`);

  const existing = doc.mcp;
  const mcp = isRecord(existing) ? { ...existing } : {};
  if (edit.value === null) delete mcp[edit.name];
  else mcp[edit.name] = translateServer(edit.value as McpServer);

  return { supported: true, changes: [{ path, before, after: serializeJson({ ...doc, mcp }) }] };
}

// ── skills-dir ──────────────────────────────────────────────────

async function writeSkillsDir(
  fs: FsProvider,
  _store: ConfigStore,
  directoryPath: string,
  edit: StoreEdit,
): Promise<StoreWritePlan> {
  if (!isSafeSegment(edit.name)) {
    return unsupported(`'${edit.name}' is not a usable skill directory name.`);
  }
  const path = fs.joinPath(directoryPath, edit.name, "SKILL.md");
  const before = await readBefore(fs, path);
  if (edit.value === null) return { supported: true, changes: [{ path, before, after: null }] };

  const value = edit.value as Partial<SkillStoreValue>;
  if (typeof value.content !== "string") {
    return unsupported(`skill '${edit.name}' has no SKILL.md content to write.`);
  }
  return { supported: true, changes: [{ path, before, after: value.content }] };
}

// ── markdown-instructions ───────────────────────────────────────

async function writeMarkdownInstructions(
  fs: FsProvider,
  store: ConfigStore,
  path: string,
  edit: StoreEdit,
): Promise<StoreWritePlan> {
  // A directory store holds one file per instruction; a single-file store is
  // shared with the user's own prose, so it gets a marker block (AC-30).
  if (store.shape?.directory) {
    if (!isSafeSegment(edit.name)) {
      return unsupported(`'${edit.name}' is not a usable instruction file name.`);
    }
    const filePath = fs.joinPath(path, `${edit.name}.md`);
    const before = await readBefore(fs, filePath);
    if (edit.value === null) {
      return { supported: true, changes: [{ path: filePath, before, after: null }] };
    }
    const value = edit.value as Partial<InstructionsStoreValue>;
    if (typeof value.content !== "string") {
      return unsupported(`instructions '${edit.name}' have no content to write.`);
    }
    return { supported: true, changes: [{ path: filePath, before, after: value.content }] };
  }

  const before = await readBefore(fs, path);
  const current = before ?? "";
  if (edit.value === null) {
    if (!findMarkerBlock(current, MARKER_NAME, edit.name)) {
      return { supported: true, changes: [] };
    }
    // Exact marker match, not startsWith: removing "api" was stripping the
    // markers off "api-extra", turning managed content into unmanaged prose
    // and making the next sync append a duplicate block.
    const beginTag = `<!-- BEGIN harness:${MARKER_NAME}:${edit.name} -->`;
    const endTag = `<!-- END harness:${MARKER_NAME}:${edit.name} -->`;
    const lines = current.split("\n");
    const begin = lines.findIndex((line) => line.trim() === beginTag);
    const end = lines.findIndex((line, index) => index > begin && line.trim() === endTag);
    const after =
      begin === -1 || end === -1
        ? current
        : [...lines.slice(0, begin), ...lines.slice(end + 1)].join("\n").replace(/\n{3,}/g, "\n\n");
    return { supported: true, changes: [{ path, before, after }] };
  }

  const value = edit.value as Partial<InstructionsStoreValue>;
  if (typeof value.content !== "string") {
    return unsupported(`instructions '${edit.name}' have no content to write.`);
  }
  const after = findMarkerBlock(current, MARKER_NAME, edit.name)
    ? replaceMarkerBlock(current, MARKER_NAME, edit.name, value.content)
    : appendMarkerBlock(current, MARKER_NAME, edit.name, value.content);
  return { supported: true, changes: [{ path, before, after }] };
}

// ── dispatch ────────────────────────────────────────────────────

type StoreWriter = (
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
  edit: StoreEdit,
) => Promise<StoreWritePlan>;

/**
 * Exhaustive writer table: adding a StoreFormatId without a writer fails to
 * compile. `null` means the format has no write side this milestone —
 * json-generic holds permissions, which is not a tier-one kind.
 */
const WRITERS: Record<StoreFormatId, StoreWriter | null> = {
  "json-mcpservers": writeJsonMcpServers,
  "json-generic": null,
  "skills-dir": writeSkillsDir,
  "markdown-instructions": writeMarkdownInstructions,
  "toml-codex": writeTomlCodex,
  "json-opencode": writeJsonOpencode,
};

/**
 * Plan the file changes that realize one resource-level edit against one
 * config store. Returns `supported: false` — never throws — when the kind or
 * format has no write path, so the caller can still offer its other actions.
 */
export async function planStoreWrite(
  fs: FsProvider,
  store: ConfigStore,
  absolutePath: string,
  edit: StoreEdit,
): Promise<StoreWritePlan> {
  if (!TIER_ONE.has(edit.kind)) {
    return unsupported(
      `'${edit.kind}' has no direct-write path yet — use the CLI command or agent prompt for this cell.`,
    );
  }
  const writer = (WRITERS as Partial<Record<string, StoreWriter | null>>)[store.formatId];
  if (!writer) {
    return unsupported(
      `formatId '${store.formatId}' has no writer — use the CLI command or agent prompt for this cell.`,
    );
  }
  return writer(fs, store, absolutePath, edit);
}
