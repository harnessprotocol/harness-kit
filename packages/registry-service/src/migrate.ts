import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PostgresRegistryRepository } from "./postgres.js";

export async function migrate(connectionString = process.env.DATABASE_URL): Promise<void> {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const repository = PostgresRegistryRepository.fromConnectionString(connectionString);
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../migrations/001_initial.sql"),
    resolve(here, "../../migrations/001_initial.sql"),
  ];
  let sql: string | undefined;
  for (const path of candidates) {
    try {
      sql = await readFile(path, "utf8");
      break;
    } catch {
      // Try the source and bundled layouts.
    }
  }
  if (!sql) throw new Error("migration file 001_initial.sql was not found");
  try {
    await repository.pool.query(sql);
  } finally {
    await repository.pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => console.log("Registry migrations complete.")).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
