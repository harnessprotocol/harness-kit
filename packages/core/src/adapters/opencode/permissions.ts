import type { FsProvider } from "../../fs-provider.js";
import type { HarnessPermissions } from "../../types.js";
import { readJsonOrDefault } from "../../utils/read-json.js";
import type { ImportedPermissions } from "../../import/types.js";
import type { OpenCodeConfigFile, OpenCodePermission, OpenCodePermissionVerdict } from "./types.js";

export type { OpenCodePermission, OpenCodePermissionVerdict } from "./types.js";

const OPENCODE_CONFIG_FILE = "opencode.json";

/**
 * harness-kit's permissions.tools.{allow,deny,ask} maps onto OpenCode's
 * `permission.bash` glob→verdict map. This is a LOSSY, partial mapping —
 * OpenCode has no path/network allowlist concept at all (see spike verdict:
 * permissions "partial"), and its bash permission keys are shell-command
 * globs, not harness-kit's tool names — so tool names are mapped through
 * as-is (best effort; a real bridge would need per-tool glob translation,
 * out of scope here). Only `bash` is populated; `edit`/`webfetch` are left
 * untouched since harness.yaml's `permissions.tools` doesn't distinguish
 * edit/webfetch operations from general tool calls.
 */
export function buildOpenCodePermission(perms: HarnessPermissions): OpenCodePermission | null {
  const bash: Record<string, OpenCodePermissionVerdict> = {};

  for (const name of perms.tools?.allow ?? []) bash[name] = "allow";
  for (const name of perms.tools?.ask ?? []) bash[name] = "ask";
  for (const name of perms.tools?.deny ?? []) bash[name] = "deny";

  if (Object.keys(bash).length === 0) return null;
  return { bash };
}

/**
 * Reverse: opencode.json's `permission.bash` glob→verdict map → harness.yaml
 * permissions.tools.{allow,deny,ask}. Only the `bash` sub-key is structured
 * enough to reverse (a glob→verdict record); `edit`/`webfetch` are flat
 * single-verdict values with no analogous harness.yaml field, so they are
 * not imported (mirrors the "partial" import declaration).
 */
export async function readOpenCodePermissions(
  fs: FsProvider,
  adapter: "opencode",
): Promise<ImportedPermissions | null> {
  const cwd = fs.cwd();
  const fullPath = fs.joinPath(cwd, OPENCODE_CONFIG_FILE);
  const { data, existed } = await readJsonOrDefault<OpenCodeConfigFile>(fs, fullPath, {});
  if (!existed) return null;

  const permission = data.permission;
  if (!permission || typeof permission.bash !== "object") return null;

  const allow: string[] = [];
  const deny: string[] = [];
  const ask: string[] = [];

  for (const [glob, verdict] of Object.entries(permission.bash)) {
    if (verdict === "allow") allow.push(glob);
    else if (verdict === "deny") deny.push(glob);
    else if (verdict === "ask") ask.push(glob);
  }

  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return null;

  const permissions: HarnessPermissions = {
    tools: {
      ...(allow.length > 0 ? { allow } : {}),
      ...(deny.length > 0 ? { deny } : {}),
      ...(ask.length > 0 ? { ask } : {}),
    },
  };

  return {
    value: { value: permissions, source: { adapter, file: OPENCODE_CONFIG_FILE } },
  };
}
