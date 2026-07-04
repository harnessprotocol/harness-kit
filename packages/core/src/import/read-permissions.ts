import type { FsProvider } from "../fs-provider.js";
import type { AdapterId } from "../adapters/adapter.js";
import type { HarnessPermissions } from "../types.js";
import { readJsonOrDefault } from "../utils/read-json.js";
import type { ImportedPermissions } from "./types.js";

interface ClaudeSettingsPermissions {
  allow?: string[];
  deny?: string[];
  additionalDirectories?: string[];
}

/**
 * Reverses `compileClaudeCodePermissions()` in compile/permissions.ts. Only
 * claude-code's `.claude/settings.json` is machine-enforced/structured enough
 * to import — cursor/copilot/agents-md only ever get a human-readable text
 * blurb appended to instructions (see permissions.ts), which is NOT
 * structured data and must not be parsed back (it's opaque instruction
 * prose, already covered by the instructions import path).
 *
 * additionalDirectories maps one-way back to permissions.paths.writable —
 * this is a lossy but honest reversal: compile only ever writes writable
 * paths there (readonly paths are never written, see permissions.ts), so
 * there is no ambiguity to resolve.
 */
export async function readClaudeSettingsPermissions(
  fs: FsProvider,
  relPath: string,
  adapter: AdapterId,
): Promise<ImportedPermissions | null> {
  const fullPath = fs.joinPath(fs.cwd(), relPath);
  const { data, existed } = await readJsonOrDefault<Record<string, unknown>>(fs, fullPath, {});
  if (!existed) return null;

  const raw = data.permissions as ClaudeSettingsPermissions | undefined;
  if (!raw) return null;

  const permissions: HarnessPermissions = {};

  if (raw.allow?.length || raw.deny?.length) {
    permissions.tools = {
      ...(raw.allow?.length ? { allow: raw.allow } : {}),
      ...(raw.deny?.length ? { deny: raw.deny } : {}),
    };
  }

  if (raw.additionalDirectories?.length) {
    permissions.paths = { writable: raw.additionalDirectories };
  }

  if (Object.keys(permissions).length === 0) return null;

  return {
    value: { value: permissions, source: { adapter, file: relPath } },
  };
}
