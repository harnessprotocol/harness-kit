import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign as signEd } from "node:crypto";
import { resolveDefinitions, DEFAULT_TTL_MS } from "../src/definitions/resolve.js";
import type { CachedDefinitions, DefinitionsStore } from "../src/definitions/resolve.js";
import { NodeSignatureVerifier } from "../src/definitions/providers-node.js";
import { toBundle } from "../src/definitions/bundle.js";
import { SURFACES, getSurface } from "../src/surfaces/registry.js";
import type { Fetcher, FetchResult } from "../src/definitions/providers.js";
import type { SurfaceDescriptor } from "../src/surfaces/types.js";

/**
 * The shared resolver (AC-25, AC-26) — the sequence both the CLI and the
 * desktop run. Real Ed25519 keys and the real verifier throughout: a stub
 * verifier would prove nothing about the property that matters.
 */

const NOW = "2026-09-08T12:00:00.000Z";
const BASE = "https://harnesskit.ai/definitions/v1";

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return {
    raw: new Uint8Array(der.subarray(der.length - 32)),
    sign: (bytes: Uint8Array) => new Uint8Array(signEd(null, bytes, privateKey)),
  };
}

function movedBundleBytes(bundleNumber: number, path = ".config/claude/AGENTS.md"): Uint8Array {
  const moved: SurfaceDescriptor = {
    ...getSurface("claude-code"),
    stores: getSurface("claude-code").stores.map((store) =>
      store.kind === "instructions" && store.scope === "user" ? { ...store, path } : store,
    ),
  };
  return new TextEncoder().encode(
    JSON.stringify(toBundle({ surfaces: [moved], capabilityMatrix: {}, bundleNumber })),
  );
}

function instructionsPath(surfaces: readonly SurfaceDescriptor[]): string | undefined {
  return surfaces
    .find((s) => s.id === "claude-code")
    ?.stores.find((s) => s.kind === "instructions" && s.scope === "user")?.path;
}

/** A fetcher that serves one signed bundle and counts requests. */
function servingFetcher(bytes: Uint8Array, signature: Uint8Array) {
  const calls: string[] = [];
  const fetcher: Fetcher = {
    async get(url): Promise<FetchResult> {
      calls.push(url);
      return { status: "ok", bytes: url.endsWith(".sig") ? signature : bytes };
    },
  };
  return { fetcher, calls };
}

function memoryStore(seed?: { cached?: CachedDefinitions; floor?: number }) {
  let cached = seed?.cached ?? null;
  let floor = seed?.floor ?? null;
  const writes = { cached: [] as CachedDefinitions[], floor: [] as number[] };
  const store: DefinitionsStore = {
    async getCachedDefinitions() {
      return cached;
    },
    async putCachedDefinitions(entry) {
      writes.cached.push(entry);
      cached = entry;
    },
    async getHighestBundleNumber() {
      return floor;
    },
    async recordBundleNumber(bundleNumber) {
      writes.floor.push(bundleNumber);
      floor = Math.max(floor ?? 0, bundleNumber);
    },
  };
  return { store, writes };
}

const key = keypair();
const base = {
  verifier: new NodeSignatureVerifier(),
  publisherKeys: [{ id: "k1", publicKey: key.raw }],
  baseUrl: BASE,
  now: NOW,
};

describe("freshness window", () => {
  it("serves a FRESH cache without any request", async () => {
    // One fetch a day, not one per command. Before this, every CLI invocation
    // issued two requests with a 10s timeout.
    const bytes = movedBundleBytes(5);
    const { fetcher, calls } = servingFetcher(bytes, key.sign(bytes));
    const { store } = memoryStore({
      cached: {
        bundleNumber: 5,
        fetchedAt: "2026-09-08T11:00:00.000Z", // one hour old
        payload: bytes,
        signature: key.sign(bytes),
      },
    });

    const resolved = await resolveDefinitions({ ...base, fetcher, store });

    expect(resolved.source).toBe("cache");
    expect(calls).toEqual([]);
    expect(instructionsPath(resolved.surfaces)).toBe(".config/claude/AGENTS.md");
  });

  it("RE-VERIFIES the fresh cache rather than trusting it", async () => {
    // Skipping the fetch must never skip the signature check: the cache is a
    // file any process running as this user can rewrite.
    const bytes = movedBundleBytes(5);
    const attacker = keypair();
    const { fetcher } = servingFetcher(bytes, key.sign(bytes));
    const { store } = memoryStore({
      cached: {
        bundleNumber: 5,
        fetchedAt: "2026-09-08T11:00:00.000Z",
        payload: bytes,
        signature: attacker.sign(bytes), // rewritten by someone else
      },
    });

    const resolved = await resolveDefinitions({ ...base, fetcher, store });

    // Falls through to a real fetch rather than serving unverified bytes.
    expect(resolved.source).toBe("remote");
  });

  it("fetches once the cache is older than the TTL", async () => {
    const bytes = movedBundleBytes(6);
    const { fetcher, calls } = servingFetcher(bytes, key.sign(bytes));
    const stale = movedBundleBytes(5, ".claude/OLD.md");
    const { store } = memoryStore({
      cached: {
        bundleNumber: 5,
        fetchedAt: "2026-09-05T12:00:00.000Z", // three days old
        payload: stale,
        signature: key.sign(stale),
      },
    });

    const resolved = await resolveDefinitions({ ...base, fetcher, store });

    expect(resolved.source).toBe("remote");
    expect(calls).toHaveLength(2);
    expect(instructionsPath(resolved.surfaces)).toBe(".config/claude/AGENTS.md");
  });

  it("treats an unreadable or future-dated fetchedAt as stale", async () => {
    // A timestamp this build cannot read is a reason to re-fetch, and a clock
    // that jumped backwards must not pin a client on a cache for the skew.
    for (const fetchedAt of ["not a date", "", "2027-01-01T00:00:00.000Z"]) {
      const bytes = movedBundleBytes(6);
      const { fetcher, calls } = servingFetcher(bytes, key.sign(bytes));
      const { store } = memoryStore({
        cached: { bundleNumber: 5, fetchedAt, payload: bytes, signature: key.sign(bytes) },
      });

      const resolved = await resolveDefinitions({ ...base, fetcher, store });
      expect(resolved.source, fetchedAt).toBe("remote");
      expect(calls.length, fetchedAt).toBe(2);
    }
  });

  it("still applies anti-rollback to a fresh cache", async () => {
    // The short-circuit skips the REQUEST, not the checks.
    const bytes = movedBundleBytes(2);
    const { fetcher } = servingFetcher(bytes, key.sign(bytes));
    const { store } = memoryStore({
      cached: {
        bundleNumber: 2,
        fetchedAt: "2026-09-08T11:00:00.000Z",
        payload: bytes,
        signature: key.sign(bytes),
      },
      floor: 30,
    });

    const resolved = await resolveDefinitions({ ...base, fetcher, store });
    expect(resolved.source).toBe("snapshot");
    expect(resolved.reason).toContain("older than 30");
  });

  it("defaults to a 24 hour window", () => {
    expect(DEFAULT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("no publisher key", () => {
  it("returns the snapshot without a request", async () => {
    const bytes = movedBundleBytes(9);
    const { fetcher, calls } = servingFetcher(bytes, key.sign(bytes));
    const resolved = await resolveDefinitions({ ...base, publisherKeys: [], fetcher });
    expect(resolved.source).toBe("snapshot");
    expect(resolved.reason).toContain("no publisher key");
    expect(calls).toEqual([]);
    expect(resolved.surfaces).toEqual(SURFACES);
  });
});

describe("persistence ordering", () => {
  it("raises the floor BEFORE storing the payload", async () => {
    // If the process dies between the two, a raised floor with a stale cache
    // is safe; a stored payload with an unraised floor leaves the rollback
    // defence behind the data it defends.
    const order: string[] = [];
    const bytes = movedBundleBytes(7);
    const { fetcher } = servingFetcher(bytes, key.sign(bytes));
    const store: DefinitionsStore = {
      async getCachedDefinitions() {
        return null;
      },
      async getHighestBundleNumber() {
        return null;
      },
      async recordBundleNumber() {
        order.push("floor");
      },
      async putCachedDefinitions() {
        order.push("cache");
      },
    };

    await resolveDefinitions({ ...base, fetcher, store });
    expect(order).toEqual(["floor", "cache"]);
  });

  it("never throws when every store method rejects", async () => {
    const bytes = movedBundleBytes(7);
    const { fetcher } = servingFetcher(bytes, key.sign(bytes));
    const broken: DefinitionsStore = {
      getCachedDefinitions: vi.fn(async () => {
        throw new Error("locked");
      }),
      getHighestBundleNumber: vi.fn(async () => {
        throw new Error("locked");
      }),
      recordBundleNumber: vi.fn(async () => {
        throw new Error("read-only");
      }),
      putCachedDefinitions: vi.fn(async () => {
        throw new Error("read-only");
      }),
    };

    const resolved = await resolveDefinitions({ ...base, fetcher, store: broken });
    // A database problem costs the cache, never the command.
    expect(resolved.source).toBe("remote");
  });
});
