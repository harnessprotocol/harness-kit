import type { HarnessConfig, SurfaceId } from "../types.js";
import { CURRENT_PROTOCOL_VERSION } from "../utils/protocol-version.js";
import { migrateHarnessV1ToV2, type MigrationPreview } from "./resource-model.js";

/**
 * Surface-id spellings renamed by protocol v2.1, mapped to their current ids.
 * v2 documents may still use the legacy spelling as a `vendor` key (and users
 * may type it as a `--target`); v2.1 rejects it.
 */
export const LEGACY_SURFACE_RENAMES: Readonly<Record<string, SurfaceId>> = {
  copilot: "copilot-vscode",
};

/**
 * Preview a v2 → v2.1 migration: bump the version and rename legacy surface-id
 * `vendor` keys (`copilot` → `copilot-vscode`). Pure and non-mutating — the
 * input config is never touched. A doc that is not `version: "2"` (already
 * "2.1", or v1 — chain through `migrateToCurrent` for those) is returned by
 * reference with empty changes, which also makes the migration idempotent.
 */
export function migrateHarnessV2ToV21(config: HarnessConfig): MigrationPreview {
  if (config.version !== "2") return { config, changes: [] };

  const changes: string[] = [];
  let vendor = config.vendor;
  if (vendor && typeof vendor === "object" && !Array.isArray(vendor)) {
    const entries = Object.entries(vendor as Record<string, Record<string, unknown>>);
    if (entries.some(([key]) => key in LEGACY_SURFACE_RENAMES)) {
      const renamed: Array<[string, Record<string, unknown>]> = [];
      const position = new Map<string, number>();
      for (const [key, value] of entries) {
        const isLegacy = key in LEGACY_SURFACE_RENAMES;
        const target = LEGACY_SURFACE_RENAMES[key] ?? key;
        const existing = position.get(target);
        if (existing === undefined) {
          position.set(target, renamed.length);
          renamed.push([target, value]);
          if (isLegacy) changes.push(`renamed vendor key "${key}" to "${target}"`);
          continue;
        }
        // Both spellings present: keep one block under the current id, with
        // the current spelling's entries winning on overlapping keys.
        const legacySpelling = isLegacy
          ? key
          : Object.keys(LEGACY_SURFACE_RENAMES).find((k) => LEGACY_SURFACE_RENAMES[k] === target)!;
        const [, kept] = renamed[existing];
        renamed[existing] = [target, isLegacy ? { ...value, ...kept } : { ...kept, ...value }];
        // The merge change replaces any rename change already recorded for this pair.
        const renameIndex = changes.indexOf(`renamed vendor key "${legacySpelling}" to "${target}"`);
        if (renameIndex >= 0) changes.splice(renameIndex, 1);
        changes.push(
          `merged legacy vendor key "${legacySpelling}" into "${target}" (existing "${target}" entries win)`,
        );
      }
      vendor = Object.fromEntries(renamed) as HarnessConfig["vendor"];
    }
  }

  changes.push(`set protocol version to ${CURRENT_PROTOCOL_VERSION}`);
  const next: HarnessConfig = { ...config, version: CURRENT_PROTOCOL_VERSION };
  if (vendor !== config.vendor) next.vendor = vendor;
  return { config: next, changes };
}

/**
 * Migrate any supported document to the current protocol version by chaining
 * v1 → v2 → v2.1, concatenating the change descriptions. A doc already at the
 * current version is returned by reference with empty changes.
 */
export function migrateToCurrent(config: HarnessConfig): MigrationPreview {
  const v2 = migrateHarnessV1ToV2(config);
  const v21 = migrateHarnessV2ToV21(v2.config);
  return { config: v21.config, changes: [...v2.changes, ...v21.changes] };
}
