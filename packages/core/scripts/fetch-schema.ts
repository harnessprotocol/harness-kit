/**
 * Fetches the latest Harness Protocol v1 JSON Schema and writes it to
 * packages/core/src/schema/harness.schema.json.
 *
 * Usage:
 *   npx tsx packages/core/scripts/fetch-schema.ts
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_URL = "https://harnessprotocol.ai/schema/v1/harness.schema.json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, "../src/schema/harness.schema.json");

async function main() {
  console.log(`Fetching schema from ${SCHEMA_URL}...`);

  const res = await fetch(SCHEMA_URL);
  if (!res.ok) {
    console.error(`Failed to fetch schema: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const schema = await res.json();
  const formatted = JSON.stringify(schema, null, 2) + "\n";

  writeFileSync(OUTPUT, formatted, "utf-8");
  console.log(`Schema written to ${OUTPUT}`);
  console.log(`$id: ${schema.$id}`);
  console.log(`title: ${schema.title}`);
}

main();
