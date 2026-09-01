import { parse as parseToml } from "smol-toml";
import type { McpServer } from "../types.js";
import { isRecord } from "../utils/is-record.js";

/**
 * READ-ONLY codec for Codex's `~/.codex/config.toml` MCP tables
 * (design.md §3, D2 — `toml-codex` is an irregular format handled by code,
 * not the generic JSON executors). Pure string → data: file IO and
 * provenance stamping live in observe/read-store.ts.
 *
 * The write side (M2, AC-14) edits a *managed region* rather than
 * re-serializing the document: HarnessKit owns only the `[mcp_servers.*]`
 * tables it manages, so user comments, formatting, and unrelated tables
 * survive byte-for-byte (design open question 2).
 */

/**
 * MCP value read from a `[mcp_servers.NAME]` table. `bearerTokenEnvVar`
 * carries Codex's `bearer_token_env_var` (the env var NAME, never a secret)
 * as a note on the value.
 */
export type CodexMcpValue = McpServer & { bearerTokenEnvVar?: string };

export interface CodexMcpReadResult {
  entries: Array<{ name: string; value: CodexMcpValue }>;
  skipped: Array<{ reason: string }>;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/**
 * Coercion policy (pinned): TOML authors write `PORT = 8080` meaning the
 * string "8080" — primitive values (string/number/boolean) are coerced to
 * their string representation, losslessly preserving intent. Structural
 * junk (tables, arrays, dates in a string position) is NOT guessed at —
 * it skips the whole entry with a reason naming the field. Fields are
 * never silently dropped.
 */
function coercePrimitive(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

/**
 * Parse `[mcp_servers.NAME]` tables out of a Codex config.toml:
 * `command`/`args`/`env` (or `env_vars`) → stdio; `url` (+ optional
 * `bearer_token_env_var`) → network http. Degraded, never thrown: a
 * whole-file parse failure becomes a single skipped with the parse error,
 * and per-entry junk becomes skipped-with-reason.
 */
export function readCodexMcp(content: string): CodexMcpReadResult {
  let doc: unknown;
  try {
    doc = parseToml(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { entries: [], skipped: [{ reason: `invalid TOML: ${message}` }] };
  }

  const entries: CodexMcpReadResult["entries"] = [];
  const skipped: CodexMcpReadResult["skipped"] = [];

  const tables = isRecord(doc) ? doc.mcp_servers : undefined;
  if (tables === undefined) {
    // No mcp_servers table at all — not configured, not an error.
    return { entries, skipped };
  }
  if (!isRecord(tables)) {
    skipped.push({ reason: `mcp_servers is not a table (got ${describe(tables)}) — skipped.` });
    return { entries, skipped };
  }

  for (const [name, raw] of Object.entries(tables)) {
    if (!isRecord(raw)) {
      skipped.push({
        reason: `mcp server '${name}' is not a table (got ${describe(raw)}) — skipped, not observed.`,
      });
      continue;
    }

    if (typeof raw.command === "string") {
      let args: string[] | undefined;
      if (raw.args !== undefined) {
        if (!Array.isArray(raw.args)) {
          skipped.push({
            reason: `mcp server '${name}' has an 'args' that is not an array (got ${describe(raw.args)}) — skipped, not observed.`,
          });
          continue;
        }
        const coerced: string[] = [];
        let junk: unknown;
        let hasJunk = false;
        for (const item of raw.args) {
          const text = coercePrimitive(item);
          if (text === null) {
            junk = item;
            hasJunk = true;
            break;
          }
          coerced.push(text);
        }
        if (hasJunk) {
          skipped.push({
            reason: `mcp server '${name}' has a non-primitive 'args' element (got ${describe(junk)}) — skipped, not observed.`,
          });
          continue;
        }
        args = coerced;
      }

      const envField = raw.env !== undefined ? "env" : raw.env_vars !== undefined ? "env_vars" : null;
      let env: Record<string, string> | undefined;
      if (envField !== null) {
        const envRaw = raw[envField];
        if (!isRecord(envRaw)) {
          skipped.push({
            reason: `mcp server '${name}' has an '${envField}' that is not a table (got ${describe(envRaw)}) — skipped, not observed.`,
          });
          continue;
        }
        const coercedEnv: Record<string, string> = {};
        let junkKey: string | null = null;
        for (const [key, item] of Object.entries(envRaw)) {
          const text = coercePrimitive(item);
          if (text === null) {
            junkKey = key;
            break;
          }
          coercedEnv[key] = text;
        }
        if (junkKey !== null) {
          skipped.push({
            reason: `mcp server '${name}' has a non-primitive '${envField}' value for '${junkKey}' — skipped, not observed.`,
          });
          continue;
        }
        env = coercedEnv;
      }

      entries.push({
        name,
        value: {
          transport: "stdio",
          command: raw.command,
          ...(args && args.length > 0 ? { args } : {}),
          ...(env ? { env } : {}),
        },
      });
      continue;
    }

    if (typeof raw.url === "string") {
      const bearer =
        typeof raw.bearer_token_env_var === "string" ? raw.bearer_token_env_var : undefined;
      entries.push({
        name,
        value: {
          transport: "http",
          url: raw.url,
          ...(bearer ? { bearerTokenEnvVar: bearer } : {}),
        },
      });
      continue;
    }

    skipped.push({
      reason: `mcp server '${name}' has neither 'command' nor 'url' — skipped, not observed.`,
    });
  }

  return { entries, skipped };
}


// ── write side (AC-14) ──────────────────────────────────────────

/** Edit to apply. Exactly one of upsert/remove. */
export interface CodexMcpWrite {
  upsert?: { name: string; value: CodexMcpValue };
  remove?: string;
}

/** TOML basic-string escaping. */
function tomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

/** A bare key where TOML allows one, else a quoted key. */
function tomlKey(name: string): string {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : tomlString(name);
}

/** Render one `[mcp_servers.NAME]` table as a contiguous block of lines. */
function renderTable(name: string, value: CodexMcpValue): string[] {
  const lines = [`[mcp_servers.${tomlKey(name)}]`];
  if (value.transport === "stdio") {
    lines.push(`command = ${tomlString(value.command)}`);
    if (value.args && value.args.length > 0) {
      lines.push(`args = [${value.args.map(tomlString).join(", ")}]`);
    }
    if (value.env && Object.keys(value.env).length > 0) {
      // An inline table keeps the managed region contiguous, so a later edit
      // replaces one span of lines rather than hunting for sub-tables.
      const pairs = Object.entries(value.env)
        .map(([key, item]) => `${tomlKey(key)} = ${tomlString(item)}`)
        .join(", ");
      lines.push(`env = { ${pairs} }`);
    }
    return lines;
  }
  lines.push(`url = ${tomlString(value.url)}`);
  if (value.bearerTokenEnvVar) {
    lines.push(`bearer_token_env_var = ${tomlString(value.bearerTokenEnvVar)}`);
  }
  return lines;
}

/** Any table header line, e.g. `[a]`, `[[a]]`, `  [a.b]  # note`. */
const TABLE_HEADER = /^\s*\[\[?([^\]]*)\]\]?\s*(#.*)?$/;

/** The two multi-line string delimiters TOML allows. */
const MULTILINE_DELIMITERS = ['"'.repeat(3), "'".repeat(3)] as const;

/** Parse a header's dotted key path into its segments, unquoting as needed. */
function headerSegments(header: string): string[] | null {
  const segments: string[] = [];
  let rest = header.trim();
  while (rest.length > 0) {
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const quote = rest[0]!;
      let index = 1;
      let literal = "";
      while (index < rest.length && rest[index] !== quote) {
        if (quote === '"' && rest[index] === "\\") {
          index += 1;
          const escape = rest[index];
          literal +=
            escape === "n" ? "\n" : escape === "t" ? "\t" : escape === "r" ? "\r" : (escape ?? "");
        } else {
          literal += rest[index];
        }
        index += 1;
      }
      if (index >= rest.length) return null;
      segments.push(literal);
      rest = rest.slice(index + 1).trim();
    } else {
      const dot = rest.indexOf(".");
      const segment = dot === -1 ? rest : rest.slice(0, dot);
      segments.push(segment.trim());
      rest = dot === -1 ? "" : rest.slice(dot + 1).trim();
    }
    if (rest.startsWith(".")) rest = rest.slice(1).trim();
  }
  return segments;
}

/**
 * Line indices that sit inside a multi-line string.
 *
 * Without this, a `[mcp_servers.x]` written as prose inside a triple-quoted
 * block reads as a real table header, and the editor splices from the middle
 * of the user's string — deleting their text and emitting unparseable TOML.
 */
function multilineStringLines(lines: string[]): Set<number> {
  const inside = new Set<number>();
  let open: string | null = null;
  for (const [index, line] of lines.entries()) {
    if (open !== null) {
      inside.add(index);
      if (line.includes(open)) open = null;
      continue;
    }
    for (const delimiter of MULTILINE_DELIMITERS) {
      // An odd number of delimiters on a line leaves a block open.
      if ((line.split(delimiter).length - 1) % 2 === 1) {
        open = delimiter;
        break;
      }
    }
  }
  return inside;
}

/** Header key path for a line, or null when the line is not a header. */
function headerAt(lines: string[], index: number, insideString: Set<number>): string[] | null {
  if (insideString.has(index)) return null;
  const match = TABLE_HEADER.exec(lines[index] ?? "");
  if (!match) return null;
  return headerSegments(match[1] ?? "");
}

/**
 * Every line span belonging to `[mcp_servers.NAME]` and its sub-tables.
 *
 * Returns a list, because a sub-table is legal anywhere in the file rather
 * than only adjacent to its parent. Leaving a distant `[mcp_servers.x.env]`
 * behind orphaned the server on remove (a table with no command, which the
 * reader then skips as malformed) and produced a duplicate-key parse error
 * on upsert.
 */
function findRegions(
  lines: string[],
  name: string,
  insideString: Set<number>,
): Array<{ start: number; end: number; isParent: boolean }> {
  const regions: Array<{ start: number; end: number; isParent: boolean }> = [];
  let current: { start: number; isParent: boolean } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const segments = headerAt(lines, index, insideString);
    if (!segments) continue;
    if (current) {
      regions.push({ ...current, end: index });
      current = null;
    }
    if (segments.length >= 2 && segments[0] === "mcp_servers" && segments[1] === name) {
      current = { start: index, isParent: segments.length === 2 };
    }
  }
  if (current) regions.push({ ...current, end: lines.length });
  return regions;
}

/**
 * Pull a region's end back off the comment block introducing the NEXT table.
 *
 * A region runs to the following header, which sweeps up the comment lines
 * written immediately above it. Those belong to the next table, and deleting
 * them contradicts this file's entire reason for existing.
 */
function trimTrailingPreamble(lines: string[], start: number, end: number): number {
  let cut = end;
  while (cut > start) {
    const line = (lines[cut - 1] ?? "").trim();
    if (line.startsWith("#") || line.length === 0) cut -= 1;
    else break;
  }
  // Keep one blank line as the separator the region already had.
  if (cut < end && (lines[cut] ?? "").trim().length === 0) cut += 1;
  return cut;
}

/**
 * Apply one MCP edit to a Codex config, preserving everything outside the
 * managed table byte-for-byte.
 *
 * Throws rather than guessing when the file cannot be parsed, or when
 * `mcp_servers` is an inline table this line-based editor cannot splice
 * safely — writing garbage into a user's config is the worse failure.
 */
export function writeCodexMcp(content: string, edit: CodexMcpWrite): string {
  let doc: unknown;
  try {
    doc = parseToml(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`refusing to edit invalid TOML: ${message}`);
  }

  const hasTables = isRecord(doc) && isRecord(doc.mcp_servers);
  const lines = content.split("\n");
  const hasTrailingNewline = lines.length > 0 && lines.at(-1) === "";
  const body = hasTrailingNewline ? lines.slice(0, -1) : lines;

  if (hasTables && Object.keys((doc as { mcp_servers: Record<string, unknown> }).mcp_servers).length > 0) {
    // Values exist but no `[mcp_servers.*]` header does ⇒ inline form.
    const stringLines = multilineStringLines(body);
    const anyHeader = body.some(
      (_line, index) => headerAt(body, index, stringLines)?.[0] === "mcp_servers",
    );
    if (!anyHeader) {
      throw new Error(
        "refusing to edit an inline mcp_servers table — rewrite it as [mcp_servers.NAME] tables first",
      );
    }
  }

  const name = edit.upsert?.name ?? edit.remove;
  if (name === undefined) throw new Error("writeCodexMcp requires an upsert or a remove");

  const insideString = multilineStringLines(body);
  const regions = findRegions(body, name, insideString).map((region) => ({
    ...region,
    end: trimTrailingPreamble(body, region.start, region.end),
  }));

  if (regions.length === 0) {
    if (edit.remove !== undefined) return content;
    const rendered = renderTable(edit.upsert!.name, edit.upsert!.value);
    const needsBlank = body.length > 0 && body.at(-1)?.trim() !== "";
    return `${[...body, ...(needsBlank ? [""] : []), ...rendered].join("\n")}\n`;
  }

  // Splice every region out, re-inserting the rendered table where the parent
  // table was, so a sub-table elsewhere in the file cannot survive its parent.
  const rendered = edit.remove !== undefined ? [] : renderTable(edit.upsert!.name, edit.upsert!.value);
  const parentIndex = regions.findIndex((region) => region.isParent);
  const insertAt = parentIndex === -1 ? 0 : parentIndex;
  const next: string[] = [];
  let cursor = 0;
  for (const [index, region] of regions.entries()) {
    next.push(...body.slice(cursor, region.start));
    if (index === insertAt) next.push(...rendered);
    cursor = region.end;
  }
  next.push(...body.slice(cursor));
  return `${next.join("\n")}${hasTrailingNewline ? "\n" : ""}`;
}
