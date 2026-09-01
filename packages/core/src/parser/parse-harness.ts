import { parse } from "yaml";
import type { HarnessConfig } from "../types.js";
import { isLegacyFormat } from "../utils/legacy.js";
import { migrateHarnessV2ToV21 } from "../portability/migrate-v21.js";

export interface ParseResult {
  config: HarnessConfig;
  isLegacyFormat: boolean;
  /**
   * Structured record of the automatic in-memory v2 → v2.1 migration.
   * `applied` is false (with empty `changes`) when the document is already
   * current — or is not a `version: "2"` doc: v1 documents keep their
   * dedicated legacy handling and are never auto-migrated here. `changes`
   * holds the raw change descriptions for UIs to render directly. The
   * returned `config` is the migrated one; the document on disk is untouched.
   */
  migration: { applied: boolean; changes: string[] };
  /**
   * Display-ready lines for the migration: one line per change plus a single
   * trailing remediation line. Empty whenever `migration.applied` is false.
   */
  warnings: string[];
}

export function parseHarness(yamlString: string): ParseResult {
  let raw: unknown;
  try {
    raw = parse(yamlString);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `YAML syntax error: ${msg}\n\nCommon causes: wrong indentation, missing quotes around special characters (like ':' in strings), or tabs used instead of spaces.`,
    );
  }

  if (raw === null || raw === undefined || typeof raw !== "object") {
    throw new Error(
      "harness.yaml is empty or does not contain a YAML mapping.",
    );
  }

  const doc = raw as Record<string, unknown>;
  // Auto-migrate v2 documents to v2.1 in memory. Validation of the returned
  // config still succeeds for a v2 doc using the legacy "copilot" vendor key:
  // that key is valid under v2, and by the time validateHarness sees the
  // migrated config it has already been renamed to "copilot-vscode".
  const migration = migrateHarnessV2ToV21(doc as unknown as HarnessConfig);
  const applied = migration.changes.length > 0;

  return {
    config: migration.config,
    isLegacyFormat: isLegacyFormat(doc),
    migration: { applied, changes: migration.changes },
    warnings: applied
      ? [
          ...migration.changes.map((change) => `migrated to protocol v2.1 in memory: ${change}`),
          "the file on disk is unchanged — run `harness-kit migrate --write` to persist the migration",
        ]
      : [],
  };
}
