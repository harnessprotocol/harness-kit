import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STATE_SCHEMA_VERSION,
  STATE_VERSION_PROBES,
  stateSchemaMigrations,
} from "@harness-kit/core";

/**
 * Rust embeds this file to create and migrate ~/.harness/harness.db (AC-32).
 * It cannot read the TypeScript schema, so drift between the two would let
 * the app and the CLI build different databases from the same version number.
 * Regenerate with: node apps/desktop/scripts/generate-state-schema.mjs
 */
describe("generated Rust state schema", () => {
  it("matches core's schema", () => {
    // vitest runs from apps/desktop; import.meta.url is not a file URL here.
    const path = join(process.cwd(), "src-tauri", "generated", "state-schema.json");
    const generated = JSON.parse(readFileSync(path, "utf8"));
    expect(generated).toEqual({
      version: STATE_SCHEMA_VERSION,
      migrations: stateSchemaMigrations(),
      versionProbes: STATE_VERSION_PROBES,
    });
  });
});
