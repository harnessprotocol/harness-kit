import type { RecordKind, RegistryRecord } from "./types.js";

export interface RegistryRepository {
  put<T>(record: RegistryRecord<T>): Promise<void>;
  get<T>(kind: RecordKind, id: string): Promise<RegistryRecord<T> | null>;
  list<T>(kind: RecordKind, organizationId?: string): Promise<Array<RegistryRecord<T>>>;
  delete(kind: RecordKind, id: string): Promise<void>;
}

export interface BlobStore {
  putImmutable(key: string, content: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}
