import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import type { SurfaceDescriptor } from "@harness-kit/core";
import { resolveDesktopDefinitions } from "./definitions";
import { detectDesktopPlatform } from "../pages/machine/machine-data";

/**
 * Claude Code's user-scope MCP store, as the surface registry declares it
 * (AC-30, audit B3).
 *
 * The MCP page used to read a hard-coded ~/.claude/mcp.json while the Machine
 * view read ~/.claude.json, so the two screens disagreed about which servers
 * existed. The path now comes from the same resolved registry the Machine view
 * uses (AC-26), so a definitions bundle that moves the file moves both.
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
  servers: McpServerEntries;
}

/**
 * A failure the page can explain: `summary` says what failed in plain words,
 * `detail` is the raw error for the Details disclosure (AC-20).
 */
export class McpStoreError extends Error {
  constructor(
    readonly summary: string,
    readonly kind: "registry" | "read" | "invalid" | "conflict" | "write",
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

function serversOf(doc: Record<string, unknown>, rootKey: string): McpServerEntries {
  const value = doc[rootKey];
  if (!isRecord(value)) return {};
  const servers: McpServerEntries = {};
  for (const [name, entry] of Object.entries(value)) {
    if (isRecord(entry)) servers[name] = entry;
  }
  return servers;
}

export async function readMcpStore(location: McpStoreLocation): Promise<McpStoreSnapshot> {
  const raw = await readRaw(location);
  if (raw === null) return { location, found: false, servers: {} };
  return { location, found: true, servers: serversOf(parseDocument(location, raw), location.rootKey) };
}

/**
 * Replace the servers object, leaving every other key in the file alone.
 *
 * ~/.claude.json is Claude Code's whole state file (projects, onboarding,
 * caches), and Claude Code rewrites it while running. So the write re-reads
 * the file at save time and merges onto THAT, not onto what the page loaded:
 * keys Claude Code changed in the meantime survive. The servers object itself
 * is the one thing that must not have moved — if it did, someone else edited
 * MCP servers since the page loaded, and saving would silently undo that.
 *
 * The write goes through apply_surface_transaction, which re-checks the path
 * against the registry allowlist compiled into the Rust side. Not core's
 * transaction engine: its temp-file-then-rename step writes
 * `.claude.json.harness-tmp-*`, which that allowlist refuses, and its preimage
 * backup would copy this file (MCP env values included) into a new location.
 */
export async function writeMcpServers(
  location: McpStoreLocation,
  expected: McpServerEntries,
  /** Receives the file's current servers object and returns the new one. */
  update: (current: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const raw = await readRaw(location);
  const doc = raw === null ? {} : parseDocument(location, raw);
  if (JSON.stringify(serversOf(doc, location.rootKey)) !== JSON.stringify(expected)) {
    throw new McpStoreError(
      `The MCP servers in ${location.displayPath} changed since this page loaded.`,
      "conflict",
    );
  }
  const current = isRecord(doc[location.rootKey]) ? (doc[location.rootKey] as Record<string, unknown>) : {};
  const content = `${JSON.stringify({ ...doc, [location.rootKey]: update({ ...current }) }, null, 2)}${
    raw === null || raw.endsWith("\n") ? "\n" : ""
  }`;
  try {
    await invoke("apply_surface_transaction", {
      files: [{ relativePath: location.relativePath, content }],
    });
  } catch (error) {
    throw new McpStoreError(`Couldn't save ${location.displayPath}.`, "write", rawMessage(error));
  }
}
