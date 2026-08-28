import {
  LiveGitHubOAuthProvider,
  RegistryError,
  RegistryService,
  S3BlobStore,
  createRegistryHttpHandler,
  startRegistryServer
} from "./chunk-7JOQLGTZ.js";
import {
  PostgresRegistryRepository,
  migrate
} from "./chunk-YXATZP6R.js";

// src/memory.ts
var MemoryRegistryRepository = class {
  records = /* @__PURE__ */ new Map();
  async put(record) {
    this.records.set(`${record.kind}:${record.id}`, structuredClone(record));
  }
  async get(kind, id) {
    const record = this.records.get(`${kind}:${id}`);
    return record ? structuredClone(record) : null;
  }
  async list(kind, organizationId) {
    return [...this.records.values()].filter((record) => record.kind === kind && (!organizationId || record.organizationId === organizationId)).map((record) => structuredClone(record));
  }
  async delete(kind, id) {
    this.records.delete(`${kind}:${id}`);
  }
};
var MemoryBlobStore = class {
  blobs = /* @__PURE__ */ new Map();
  async putImmutable(key, content) {
    const existing = this.blobs.get(key);
    if (existing && Buffer.compare(existing, content) !== 0) {
      throw new Error(`immutable blob collision at ${key}`);
    }
    if (!existing) this.blobs.set(key, new Uint8Array(content));
  }
  async get(key) {
    const content = this.blobs.get(key);
    return content ? new Uint8Array(content) : null;
  }
};
export {
  LiveGitHubOAuthProvider,
  MemoryBlobStore,
  MemoryRegistryRepository,
  PostgresRegistryRepository,
  RegistryError,
  RegistryService,
  S3BlobStore,
  createRegistryHttpHandler,
  migrate,
  startRegistryServer
};
//# sourceMappingURL=index.js.map