#!/usr/bin/env node
/**
 * Emit the Rust side's copy of the machine-state schema.
 *
 * The schema is TypeScript (packages/core/src/state/schema.ts), but the Tauri
 * ledger commands must be able to CREATE the database — a desktop-only user
 * never runs the CLI that would otherwise make it. Hand-copying DDL into Rust
 * is exactly the drift hazard the write-scope allowlist taught us to avoid,
 * so it is generated here, embedded with include_str!, and a vitest asserts
 * the checked-in file still matches core.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STATE_SCHEMA_VERSION, stateSchemaMigrations } from "@harness-kit/core";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "src-tauri", "generated", "state-schema.json");

const payload = { version: STATE_SCHEMA_VERSION, migrations: stateSchemaMigrations() };
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`wrote ${out}`);
