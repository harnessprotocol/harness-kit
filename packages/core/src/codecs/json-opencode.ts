import type { McpServer } from "../types.js";
import { reverseTranslateServer } from "../adapters/opencode/mcp.js";
import type { OpenCodeMcpEntry } from "../adapters/opencode/types.js";

/**
 * READ-ONLY codec for OpenCode's merged `opencode.json` `mcp` key
 * (design.md §3, D2 — `json-opencode` is an irregular format handled by
 * code). Thin wrapper: entry translation delegates to the existing OpenCode
 * reverse translator in adapters/opencode/mcp.ts so both paths map
 * `{type:"local",command:[...]}` / `{type:"remote",url}` identically. Pure
 * string → data: file IO and provenance stamping live in
 * observe/read-store.ts (readOpenCodeMcp in the adapter stays the
 * import-side entry point, hardwired to cwd/opencode.json).
 */

/**
 * MCP value read from an opencode.json entry. Pinned behavior: a server with
 * `enabled: false` IS included — observation reports what exists on disk —
 * with the flag carried on the value; the flag is absent for active servers.
 */
export type OpenCodeMcpValue = McpServer & { enabled?: false };

export interface OpenCodeMcpReadResult {
  entries: Array<{ name: string; value: OpenCodeMcpValue }>;
  skipped: Array<{ reason: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse the `mcp` key of an opencode.json document. Degraded, never thrown:
 * a whole-file parse failure becomes a single skipped with the parse error,
 * and untranslatable entries become skipped-with-reason.
 */
export function readOpenCodeMcpConfig(content: string): OpenCodeMcpReadResult {
  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { entries: [], skipped: [{ reason: `invalid JSON: ${message}` }] };
  }

  const entries: OpenCodeMcpReadResult["entries"] = [];
  const skipped: OpenCodeMcpReadResult["skipped"] = [];

  if (!isRecord(doc)) {
    skipped.push({ reason: "expected a JSON object at the top level — skipped." });
    return { entries, skipped };
  }

  const mcp = doc.mcp;
  if (mcp === undefined) {
    // No mcp key at all — not configured, not an error.
    return { entries, skipped };
  }
  if (!isRecord(mcp)) {
    skipped.push({ reason: "'mcp' is not an object — skipped." });
    return { entries, skipped };
  }

  for (const [name, raw] of Object.entries(mcp)) {
    if (!isRecord(raw)) {
      skipped.push({ reason: `mcp server '${name}' is not an object — skipped, not observed.` });
      continue;
    }
    const entry = raw as unknown as OpenCodeMcpEntry;
    const reversed = reverseTranslateServer(entry);
    if (!reversed) {
      skipped.push({
        reason: `mcp server '${name}' has an unrecognized or incomplete shape (type: ${String(entry.type)}) — skipped, not observed.`,
      });
      continue;
    }
    entries.push({
      name,
      value: { ...reversed, ...(entry.enabled === false ? { enabled: false as const } : {}) },
    });
  }

  return { entries, skipped };
}
