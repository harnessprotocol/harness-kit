import { homeDir } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import {
  applyFileTransaction,
  createHomeTransactionRoot,
  recordAppliedTransaction,
} from "@harness-kit/core";
import type { SurfaceDescriptor } from "@harness-kit/core";
import { resolveDesktopDefinitions } from "./definitions";
import { TauriSurfaceFsProvider } from "./surface-fs";
import { TauriTransactionLedger } from "./state-ledger";
import { detectDesktopPlatform } from "../pages/machine/machine-data";

/**
 * Claude Code's user-scope MCP store, as the surface registry declares it
 * (AC-30, audit B3).
 *
 * The MCP page used to read a hard-coded ~/.claude/mcp.json while the Machine
 * view read ~/.claude.json, so the two screens disagreed about which servers
 * existed. The path now comes from the same resolved registry the Machine view
 * uses (AC-26), so both screens name the same file.
 *
 * A definitions bundle cannot move where this page may read or write, though:
 * the fs plugin's read scope (capabilities/default.json) and the Rust write
 * allowlist (generated/write-scope.json) are both fixed at build time. A
 * bundle that points the store somewhere outside them gets a read or write
 * refusal, not an editor for the new path.
 */

export type McpServerEntries = Record<string, Record<string, unknown>>;

export interface McpStoreLocation {
  /** Home-relative, as apply_surface_transaction expects. */
  relativePath: string;
  absolutePath: string;
  /** "~/.claude.json" — what the page shows. */
  displayPath: string;
  /** Key that holds the servers inside the file. */
  rootKey: string;
}

export interface McpStoreSnapshot {
  location: McpStoreLocation;
  /** False when the file does not exist yet. */
  found: boolean;
  /** Entries whose value is an object: what the page shows and edits. */
  servers: McpServerEntries;
  /** Entries whose value is not an object. Not shown or edited here, and
   *  every save carries them over unchanged. */
  otherEntries: Record<string, unknown>;
  /** The whole servers object as read, both kinds of entry, in file order.
   *  A save refuses if the file's copy no longer matches it. */
  entries: Record<string, unknown>;
}

/** The phrase apply_surface_transaction uses when a precondition fails. */
const CHANGED_ON_DISK = "changed on disk since it was read";

/**
 * A failure the page can explain: `summary` says what failed in plain words,
 * `detail` is the raw error for the Details disclosure (AC-20).
 */
export class McpStoreError extends Error {
  constructor(
    readonly summary: string,
    /** "draft" is a problem with what the user typed, not with the file. */
    readonly kind: "registry" | "read" | "invalid" | "conflict" | "write" | "draft",
    readonly detail?: string,
  ) {
    super(summary);
    this.name = "McpStoreError";
  }
}

function rawMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Find Claude Code's user-scope mcp-server store in a resolved registry. */
export function findClaudeMcpStore(
  surfaces: readonly SurfaceDescriptor[],
  platform: "darwin" | "win32" | "linux",
): { relativePath: string; rootKey: string } {
  const surface = surfaces.find((entry) => entry.id === "claude-code");
  const store = surface?.stores.find((entry) => entry.kind === "mcp-server" && entry.scope === "user");
  if (!store) {
    throw new McpStoreError(
      "The surface registry declares no user MCP store for Claude Code.",
      "registry",
    );
  }
  // This page edits JSON. A bundle that re-declared the store in another
  // format must not get JSON written into it.
  if (store.formatId !== "json-mcpservers") {
    throw new McpStoreError(
      `Claude Code's MCP store is in a format this page cannot edit (${store.formatId}).`,
      "registry",
    );
  }
  return {
    relativePath: store.pathByPlatform?.[platform] ?? store.path,
    rootKey: store.shape?.rootKey ?? "mcpServers",
  };
}

export async function locateClaudeMcpStore(): Promise<McpStoreLocation> {
  const [{ surfaces }, home] = await Promise.all([resolveDesktopDefinitions(), homeDir()]);
  const { relativePath, rootKey } = findClaudeMcpStore(surfaces, detectDesktopPlatform());
  const prefix = home.endsWith("/") ? home : `${home}/`;
  return {
    relativePath,
    absolutePath: `${prefix}${relativePath}`,
    displayPath: `~/${relativePath}`,
    rootKey,
  };
}

/**
 * Read the file's bytes, or null when it does not exist.
 *
 * Uses the fs plugin's own `exists`, which THROWS on a path outside the read
 * scope. The shared TauriFsProvider swallows that into `false`, and here that
 * would be dangerous: an unreadable file would render as "no servers", and
 * the first Add would overwrite it.
 */
async function readRaw(location: McpStoreLocation): Promise<string | null> {
  try {
    if (!(await exists(location.absolutePath))) return null;
    return await readTextFile(location.absolutePath);
  } catch (error) {
    throw new McpStoreError(`Couldn't read ${location.displayPath}.`, "read", rawMessage(error));
  }
}

function parseDocument(location: McpStoreLocation, raw: string): Record<string, unknown> {
  if (raw.trim().length === 0) return {};
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (error) {
    throw new McpStoreError(
      `${location.displayPath} is not valid JSON, so its MCP servers can't be shown or edited here.`,
      "invalid",
      rawMessage(error),
    );
  }
  if (!isRecord(doc)) {
    throw new McpStoreError(`${location.displayPath} is not a JSON object.`, "invalid");
  }
  return doc;
}

/**
 * The servers object, split into editable entries and everything else.
 *
 * A root value that is not an object (an array, a string) is refused, not
 * read as "no servers": that reading would let the first Add replace it.
 */
function entriesOf(
  location: McpStoreLocation,
  doc: Record<string, unknown>,
): Pick<McpStoreSnapshot, "servers" | "otherEntries" | "entries"> {
  const value = doc[location.rootKey];
  if (value === undefined) return { servers: {}, otherEntries: {}, entries: {} };
  if (!isRecord(value)) {
    throw new McpStoreError(
      `${location.rootKey} in ${location.displayPath} is not a JSON object, so its MCP servers can't be shown or edited here.`,
      "invalid",
    );
  }
  const servers: McpServerEntries = {};
  const otherEntries: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (isRecord(entry)) servers[name] = entry;
    else otherEntries[name] = entry;
  }
  return { servers, otherEntries, entries: value };
}

export async function readMcpStore(location: McpStoreLocation): Promise<McpStoreSnapshot> {
  const raw = await readRaw(location);
  if (raw === null) return { location, found: false, servers: {}, otherEntries: {}, entries: {} };
  return { location, found: true, ...entriesOf(location, parseDocument(location, raw)) };
}

/**
 * Replace the servers object, leaving every other key's value alone.
 *
 * ~/.claude.json is Claude Code's whole state file (projects, onboarding,
 * caches), and Claude Code rewrites it while running. So the write re-reads
 * the file at save time and merges onto THAT, not onto what the page loaded:
 * keys Claude Code changed in the meantime survive. The servers object itself
 * is the one thing that must not have moved — if it did, someone else edited
 * MCP servers since the page loaded, and saving would silently undo that.
 * The file is re-serialized with two-space indentation, so formatting outside
 * the servers object can change even though no other value does.
 *
 * The write goes through core's transaction engine, like the Machine drawer:
 * the engine re-verifies the file against what was just read, copies it to
 * ~/.harness/backups, writes a manifest, and the change is recorded as a
 * rollback point. The backup is a verbatim copy of ~/.claude.json, MCP env
 * values included, so the desktop's write command makes it owner-only.
 *
 * What the Rust side guarantees: each write is atomic (temp file, fsync,
 * rename), so nothing ever reads a half-written file, and the write carries
 * the SHA-256 of the exact text read here (`replaces` on the engine's
 * provider hook), so a write that lands between that read and the rename is
 * refused rather than overwritten. Two gaps remain. Rust's own
 * check-then-rename is not a lock, so a writer landing in that microsecond
 * window still loses. And a running Claude Code that later saves from a copy
 * it read before this write will undo it; nothing on this side can see or
 * prevent that.
 *
 * The hash is of the text as the fs plugin decoded it, re-encoded as UTF-8.
 * For a UTF-8 file without a byte-order mark those are the bytes on disk;
 * for anything else the hashes differ and the save is refused, never
 * forced.
 *
 * Every path is still re-checked against the registry allowlist compiled into
 * the Rust side (apply_surface_transaction), which is the boundary.
 */
export interface McpWriteOutcome {
  /** Set when the change applied but could not be recorded as a rollback
   *  point. The backup is still on disk. */
  ledgerError?: string;
}

export async function writeMcpServers(
  location: McpStoreLocation,
  /** The whole servers object as the page loaded it (snapshot.entries). */
  expected: Record<string, unknown>,
  /** Receives the file's current servers object and returns the new one. */
  update: (current: Record<string, unknown>) => Record<string, unknown>,
): Promise<McpWriteOutcome> {
  const raw = await readRaw(location);
  const doc = raw === null ? {} : parseDocument(location, raw);
  const { entries: current } = entriesOf(location, doc);
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new McpStoreError(
      `The MCP servers in ${location.displayPath} changed since this page loaded.`,
      "conflict",
    );
  }
  const next = update({ ...current });
  // Keep the file's trailing-newline choice; a new file gets one.
  const content = `${JSON.stringify({ ...doc, [location.rootKey]: next }, null, 2)}${
    raw === null || raw.endsWith("\n") ? "\n" : ""
  }`;

  const [home, { surfaces }] = await Promise.all([homeDir(), resolveDesktopDefinitions()]);
  // Namespaced like the drawer's: the CLI mints ids from the same clock and
  // format, and the ledger upserts on the id.
  const timestamp = `${new Date().toISOString().replace(/[:.]/g, "-")}-app`;
  const changes = [
    { root: "home" as const, path: location.relativePath, before: raw, after: content },
  ];
  let result;
  try {
    result = await applyFileTransaction(changes, {
      fs: new TauriSurfaceFsProvider(home),
      timestamp,
      // The allowlist comes from the registry in force, so it admits the path
      // this page just resolved from that same registry.
      roots: { home: createHomeTransactionRoot(home, detectDesktopPlatform(), surfaces) },
    });
  } catch (error) {
    // The engine refuses before touching anything (path, precondition).
    throw classifyWriteFailure(location, rawMessage(error));
  }
  if (!result.committed) {
    // Already rolled back by the engine; the message says why it stopped.
    throw classifyWriteFailure(location, result.error ?? "the transaction did not commit");
  }

  const changed = Object.keys({ ...current, ...next }).filter(
    (name) => JSON.stringify(current[name]) !== JSON.stringify(next[name]),
  );
  const outcome = await recordAppliedTransaction(
    result,
    changes,
    {
      transactionId: timestamp,
      appliedAt: new Date().toISOString(),
      manifestRoot: home,
      surfaces: ["claude-code"],
      kinds: ["mcp-server"],
      identityKeys: changed.map((name) => `mcp-server:${name.toLowerCase()}`),
    },
    new TauriTransactionLedger(),
  );
  return outcome.error ? { ledgerError: outcome.error } : {};
}

/** A stale file is a conflict the user can retry; anything else is a failed save. */
function classifyWriteFailure(location: McpStoreLocation, detail: string): McpStoreError {
  if (detail.includes(CHANGED_ON_DISK) || detail.includes("transaction precondition failed")) {
    return new McpStoreError(
      `${location.displayPath} changed while you were editing. Reload and try again.`,
      "conflict",
      detail,
    );
  }
  return new McpStoreError(`Couldn't save ${location.displayPath}.`, "write", detail);
}
