import { Pool } from "pg";
import type { RegistryRepository } from "./repository.js";
import type { RecordKind, RegistryRecord } from "./types.js";

interface DatabaseRow {
  kind: RecordKind;
  id: string;
  organization_id: string | null;
  payload: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

function fromRow<T>(row: DatabaseRow): RegistryRecord<T> {
  return {
    kind: row.kind,
    id: row.id,
    ...(row.organization_id ? { organizationId: row.organization_id } : {}),
    data: row.payload as T,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export class PostgresRegistryRepository implements RegistryRepository {
  constructor(readonly pool: Pool) {}

  static fromConnectionString(connectionString: string): PostgresRegistryRepository {
    return new PostgresRegistryRepository(new Pool({ connectionString }));
  }

  async put<T>(record: RegistryRecord<T>): Promise<void> {
    await this.pool.query(
      `INSERT INTO registry_records (kind, id, organization_id, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (kind, id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at`,
      [record.kind, record.id, record.organizationId ?? null, JSON.stringify(record.data), record.createdAt, record.updatedAt],
    );
  }

  async get<T>(kind: RecordKind, id: string): Promise<RegistryRecord<T> | null> {
    const result = await this.pool.query<DatabaseRow>(
      "SELECT kind, id, organization_id, payload, created_at, updated_at FROM registry_records WHERE kind = $1 AND id = $2",
      [kind, id],
    );
    return result.rows[0] ? fromRow<T>(result.rows[0]) : null;
  }

  async list<T>(kind: RecordKind, organizationId?: string): Promise<Array<RegistryRecord<T>>> {
    const result = organizationId
      ? await this.pool.query<DatabaseRow>(
          "SELECT kind, id, organization_id, payload, created_at, updated_at FROM registry_records WHERE kind = $1 AND organization_id = $2 ORDER BY created_at, id",
          [kind, organizationId],
        )
      : await this.pool.query<DatabaseRow>(
          "SELECT kind, id, organization_id, payload, created_at, updated_at FROM registry_records WHERE kind = $1 ORDER BY created_at, id",
          [kind],
        );
    return result.rows.map(fromRow<T>);
  }

  async delete(kind: RecordKind, id: string): Promise<void> {
    await this.pool.query("DELETE FROM registry_records WHERE kind = $1 AND id = $2", [kind, id]);
  }
}
