import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import { parseDocument, Scalar, YAMLMap } from "yaml";
import type { Document } from "yaml";
import {
  CURRENT_PROTOCOL_VERSION,
  LEGACY_SURFACE_RENAMES,
  migrateToCurrent,
  validateHarness,
} from "@harness-kit/core";
import type { HarnessConfig } from "@harness-kit/core";
import { formatValidationResult } from "../formatters/validation.js";

interface MigrateFlags {
  write?: boolean;
}

export async function migrateCommand(filePath?: string, flags: MigrateFlags = {}): Promise<void> {
  const resolved = resolve(filePath ?? "harness.yaml");

  let content: string;
  try {
    content = await readFile(resolved, "utf-8");
  } catch {
    console.error(
      `No harness.yaml found at ${resolved}. Specify a path: harness-kit migrate <path>`,
    );
    process.exit(1);
  }

  // Parse into a yaml Document so --write can rewrite only what changed and
  // preserve comments/formatting (same approach as `exchange accept`).
  const doc = parseDocument(content);
  if (doc.errors.length > 0) {
    console.error(`YAML syntax error: ${doc.errors[0].message}`);
    process.exit(1);
  }
  const raw = doc.toJS() as HarnessConfig | null;
  if (raw === null || typeof raw !== "object") {
    console.error(`${resolved} is empty or does not contain a YAML mapping.`);
    process.exit(1);
  }

  // Validate the ORIGINAL document at its own version before migrating — a v2
  // doc with a legacy copilot vendor key is valid v2 and must not be judged
  // by the v2.1 rule it is about to be migrated past.
  const validation = validateHarness(raw);
  if (!validation.valid) {
    console.error(formatValidationResult(validation, resolved));
    process.exit(1);
  }

  const migration = migrateToCurrent(raw);
  if (migration.changes.length === 0) {
    console.log(
      `${resolved} is already at protocol v${CURRENT_PROTOCOL_VERSION} — nothing to migrate.`,
    );
    return;
  }

  console.log(
    chalk.bold(`Migration to protocol v${CURRENT_PROTOCOL_VERSION}`) +
      ` (${migration.changes.length} change${migration.changes.length === 1 ? "" : "s"}):`,
  );
  for (const change of migration.changes) {
    console.log(`  - ${change}`);
  }
  console.log("");

  if (!flags.write) {
    console.log(
      chalk.dim(`Dry run — ${resolved} was not modified. Re-run with --write to persist.`),
    );
    return;
  }

  applyMigrationToDocument(doc, migration.config);
  await writeFile(resolved, doc.toString(), "utf-8");
  console.log(chalk.green(`Migrated ${resolved} to protocol v${CURRENT_PROTOCOL_VERSION}.`));
}

/**
 * Apply the previewed migration surgically to the parsed Document so untouched
 * lines (including comments) survive the rewrite byte-for-byte.
 */
function applyMigrationToDocument(doc: Document, migrated: HarnessConfig): void {
  doc.set("version", migrated.version);
  if (migrated.$schema && !doc.has("$schema")) doc.set("$schema", migrated.$schema);
  if (migrated.scope && !doc.has("scope")) doc.set("scope", migrated.scope);

  const vendor = doc.get("vendor");
  if (!(vendor instanceof YAMLMap)) return;
  for (const pair of [...vendor.items]) {
    const key = pair.key instanceof Scalar ? pair.key.value : pair.key;
    if (typeof key !== "string") continue;
    const target = LEGACY_SURFACE_RENAMES[key];
    if (!target) continue;
    if (vendor.has(target)) {
      // Both spellings present: the migration merged them — write the merged
      // block under the current id and drop the legacy pair.
      doc.setIn(["vendor", target], (migrated.vendor as Record<string, unknown>)[target]);
      vendor.delete(key);
    } else if (pair.key instanceof Scalar) {
      pair.key.value = target;
    } else {
      pair.key = doc.createNode(target);
    }
  }
}
