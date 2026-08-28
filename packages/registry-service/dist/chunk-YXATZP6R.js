// src/migrate.ts
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// src/postgres.ts
import { Pool } from "pg";
function fromRow(row) {
  return {
    kind: row.kind,
    id: row.id,
    ...row.organization_id ? { organizationId: row.organization_id } : {},
    data: row.payload,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
var PostgresRegistryRepository = class _PostgresRegistryRepository {
  constructor(pool) {
    this.pool = pool;
  }
  pool;
  static fromConnectionString(connectionString) {
    return new _PostgresRegistryRepository(new Pool({ connectionString }));
  }
  async put(record) {
    await this.pool.query(
      `INSERT INTO registry_records (kind, id, organization_id, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (kind, id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at`,
      [record.kind, record.id, record.organizationId ?? null, JSON.stringify(record.data), record.createdAt, record.updatedAt]
    );
  }
  async get(kind, id) {
    const result = await this.pool.query(
      "SELECT kind, id, organization_id, payload, created_at, updated_at FROM registry_records WHERE kind = $1 AND id = $2",
      [kind, id]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }
  async list(kind, organizationId) {
    const result = organizationId ? await this.pool.query(
      "SELECT kind, id, organization_id, payload, created_at, updated_at FROM registry_records WHERE kind = $1 AND organization_id = $2 ORDER BY created_at, id",
      [kind, organizationId]
    ) : await this.pool.query(
      "SELECT kind, id, organization_id, payload, created_at, updated_at FROM registry_records WHERE kind = $1 ORDER BY created_at, id",
      [kind]
    );
    return result.rows.map(fromRow);
  }
  async delete(kind, id) {
    await this.pool.query("DELETE FROM registry_records WHERE kind = $1 AND id = $2", [kind, id]);
  }
};

// src/migrate.ts
async function migrate(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const repository = PostgresRegistryRepository.fromConnectionString(connectionString);
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../migrations/001_initial.sql"),
    resolve(here, "../../migrations/001_initial.sql")
  ];
  let sql;
  for (const path of candidates) {
    try {
      sql = await readFile(path, "utf8");
      break;
    } catch {
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

export {
  PostgresRegistryRepository,
  migrate
};
//# sourceMappingURL=chunk-YXATZP6R.js.map