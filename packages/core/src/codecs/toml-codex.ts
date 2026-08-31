import { parse as parseToml } from "smol-toml";
import type { McpServer } from "../types.js";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
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
      const args = isStringArray(raw.args) ? raw.args : undefined;
      const envRaw = raw.env ?? raw.env_vars;
      const env = isStringRecord(envRaw) ? envRaw : undefined;
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
