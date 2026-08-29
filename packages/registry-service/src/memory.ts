import type { BlobStore, RegistryRepository } from "./repository.js";
import type { RecordKind, RegistryRecord } from "./types.js";

export class MemoryRegistryRepository implements RegistryRepository {
  private records = new Map<string, RegistryRecord<unknown>>();

  async put<T>(record: RegistryRecord<T>): Promise<void> {
    this.records.set(`${record.kind}:${record.id}`, structuredClone(record) as RegistryRecord<unknown>);
  }

  async get<T>(kind: RecordKind, id: string): Promise<RegistryRecord<T> | null> {
    const record = this.records.get(`${kind}:${id}`);
    return record ? structuredClone(record) as RegistryRecord<T> : null;
  }

  async list<T>(kind: RecordKind, organizationId?: string): Promise<Array<RegistryRecord<T>>> {
    return [...this.records.values()]
      .filter((record) => record.kind === kind && (!organizationId || record.organizationId === organizationId))
      .map((record) => structuredClone(record) as RegistryRecord<T>);
  }

  async delete(kind: RecordKind, id: string): Promise<void> {
    this.records.delete(`${kind}:${id}`);
  }
}

export class MemoryBlobStore implements BlobStore {
  private blobs = new Map<string, Uint8Array>();

  async putImmutable(key: string, content: Uint8Array): Promise<void> {
    const existing = this.blobs.get(key);
    if (existing && Buffer.compare(existing, content) !== 0) {
      throw new Error(`immutable blob collision at ${key}`);
    }
    if (!existing) this.blobs.set(key, new Uint8Array(content));
  }

  async get(key: string): Promise<Uint8Array | null> {
    const content = this.blobs.get(key);
    return content ? new Uint8Array(content) : null;
  }
}
