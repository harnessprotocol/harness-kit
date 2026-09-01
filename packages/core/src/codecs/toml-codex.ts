import { parse as parseToml } from "smol-toml";
import type { McpServer } from "../types.js";
import { isRecord } from "../utils/is-record.js";

/**
 * READ-ONLY codec for Codex's `~/.codex/config.toml` MCP tables
 * (design.md §3, D2 — `toml-codex` is an irregular format handled by code,
 * not the generic JSON executors). Pure string → data: file IO and
 * provenance stamping live in observe/read-store.ts.
 *
 * There is no write side yet — Task 7 is a read-only milestone.
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
