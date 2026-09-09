import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign as signEd } from "node:crypto";
import {
  SURFACES,
  getSurface,
  toBundle,
  TARGET_CAPABILITY_MATRIX,
} from "@harness-kit/core";
import type { CachedDefinitions, StateStore, SurfaceDescriptor } from "@harness-kit/core";
import { resolveDefinitions } from "../src/definitions/resolve-definitions.js";

/**
 * The CLI's end of the definitions feed (AC-25, AC-26).
 *
 * `fetch` is stubbed in every case. An earlier version of this file did not
 * exist, and `resolveDefinitions` issued two REAL requests to harnesskit.ai
 * on every command — measured, not assumed — which would have made the suite
 * depend on the network.
 */

const NOW = "2026-09-08T00:00:00.000Z";

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return {
    raw: new Uint8Array(der.subarray(der.length - 32)),
    sign: (bytes: Uint8Array) => new Uint8Array(signEd(null, bytes, privateKey)),
  };
}

/** A store that records what was written, with nothing cached. */
function fakeStore(over: Partial<StateStore> = {}) {
  const writes: { floor: number[]; cached: CachedDefinitions[] } = { floor: [], cached: [] };
  const store = {
    async getCachedDefinitions() {
      return null;
    },
    async getHighestBundleNumber() {
      return null;
    },
    async recordBundleNumber(bundleNumber: number) {
      writes.floor.push(bundleNumber);
    },
    async putCachedDefinitions(entry: CachedDefinitions) {
      writes.cached.push(entry);
    },
    ...over,
  } as unknown as StateStore;
  return { store, writes };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.HARNESS_NO_DEFINITIONS_FETCH;
  delete process.env.HARNESS_DEFINITIONS_URL;
});

describe("resolveDefinitions", () => {
  it("makes NO network request while this build has no publisher key", async () => {
    // Not an optimisation: with an empty key list nothing can ever verify, so
    // the two requests and their 10s timeout buy a guaranteed snapshot.
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchSpy);

    const resolved = await resolveDefinitions(undefined, NOW);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resolved.source).toBe("snapshot");
    expect(resolved.reason).toContain("no publisher key");
    // The registry it hands back is still the real one.
    expect(resolved.surfaces).toEqual(SURFACES);
  });

  it("honours the offline opt-out without touching the network", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchSpy);
    process.env.HARNESS_NO_DEFINITIONS_FETCH = "1";

    const resolved = await resolveDefinitions(undefined, NOW);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resolved.source).toBe("snapshot");
    expect(resolved.reason).toContain("HARNESS_NO_DEFINITIONS_FETCH");
  });

});

/**
 * What happens once a publisher key exists. `PUBLISHER_KEYS` is compiled in
 * and empty, so these drive the same code path with the module mocked — the
 * only way to exercise the branch this feature exists for before key custody
 * is settled.
 */
describe("resolveDefinitions once a publisher key exists", () => {
  const key = keypair();

  async function withKey() {
    vi.resetModules();
    const core = await vi.importActual<typeof import("@harness-kit/core")>("@harness-kit/core");
    vi.doMock("@harness-kit/core", () => ({
      ...core,
      PUBLISHER_KEYS: [{ id: "test", publicKey: key.raw }],
    }));
    return (await import("../src/definitions/resolve-definitions.js")).resolveDefinitions;
  }

  afterEach(() => {
    vi.doUnmock("@harness-kit/core");
    vi.resetModules();
  });

  function movedBundleBytes(bundleNumber: number): Uint8Array {
    const moved: SurfaceDescriptor = {
      ...getSurface("claude-code"),
      stores: getSurface("claude-code").stores.map((store) =>
        store.kind === "instructions" && store.scope === "user"
          ? { ...store, path: ".config/claude/AGENTS.md" }
          : store,
      ),
    };
    return new TextEncoder().encode(
      JSON.stringify(
        toBundle({
          surfaces: [moved],
          capabilityMatrix: TARGET_CAPABILITY_MATRIX,
          bundleNumber,
          generatedAt: NOW,
        }),
      ),
    );
  }

  it("uses a verified bundle's path, and caches the exact bytes that verified", async () => {
    const bytes = movedBundleBytes(7);
    const signature = key.sign(bytes);
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith(".sig")
        ? new Response(signature, { status: 200 })
        : new Response(bytes, { status: 200 }),
    );
    const resolve = await withKey();
    const { store, writes } = fakeStore();

    const resolved = await resolve(store, NOW);

    expect(resolved.source).toBe("remote");
    const claude = resolved.surfaces.find((s) => s.id === "claude-code");
    expect(
      claude?.stores.find((s) => s.kind === "instructions" && s.scope === "user")?.path,
    ).toBe(".config/claude/AGENTS.md");

    // The floor is raised, and the cached payload is the byte sequence the
    // signature covers — not a re-serialization, which would fail its own
    // re-verification on the next run.
    expect(writes.floor).toEqual([7]);
    expect(writes.cached).toHaveLength(1);
    expect(Array.from(writes.cached[0].payload)).toEqual(Array.from(bytes));
    expect(Array.from(writes.cached[0].signature)).toEqual(Array.from(signature));
  });

  it("refuses a rollback and does not cache it", async () => {
    const bytes = movedBundleBytes(2);
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith(".sig")
        ? new Response(key.sign(bytes), { status: 200 })
        : new Response(bytes, { status: 200 }),
    );
    const resolve = await withKey();
    const { store, writes } = fakeStore({
      async getHighestBundleNumber() {
        return 30;
      },
    });

    const resolved = await resolve(store, NOW);

    expect(resolved.source).toBe("snapshot");
    expect(resolved.reason).toContain("older than 30");
    // Nothing about a refused bundle may reach the cache or the floor.
    expect(writes.cached).toEqual([]);
    expect(writes.floor).toEqual([]);
  });

  it("degrades to the snapshot when the feed is unreachable", async () => {
    // Lives in THIS block deliberately. With no publisher key the no-keys
    // gate returns "snapshot" before `fetch` is ever called, so outside here
    // the assertion held without the fixture being reached at all — the
    // counter proved zero contacts.
    let contacted = 0;
    vi.stubGlobal("fetch", async () => {
      contacted += 1;
      throw new Error("getaddrinfo ENOTFOUND harnesskit.ai");
    });
    const resolve = await withKey();

    const resolved = await resolve(undefined, NOW);

    expect(contacted).toBeGreaterThan(0);
    expect(resolved.source).toBe("snapshot");
    expect(resolved.surfaces).toEqual(SURFACES);
    expect(resolved.reason).not.toContain("no publisher key");
  });

  it("never throws when the state store is broken", async () => {
    // Same trap: without a key the store is never consulted.
    let consulted = 0;
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    const broken = {
      async getCachedDefinitions() {
        consulted += 1;
        throw new Error("database is locked");
      },
      async getHighestBundleNumber() {
        consulted += 1;
        throw new Error("database is locked");
      },
    } as unknown as StateStore;
    const resolve = await withKey();

    const resolved = await resolve(broken, NOW);

    expect(consulted).toBeGreaterThan(0);
    expect(resolved.source).toBe("snapshot");
    expect(resolved.surfaces).toEqual(SURFACES);
  });

  it("refuses a bundle signed by the wrong key", async () => {
    const bytes = movedBundleBytes(9);
    const attacker = keypair();
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith(".sig")
        ? new Response(attacker.sign(bytes), { status: 200 })
        : new Response(bytes, { status: 200 }),
    );
    const resolve = await withKey();
    const { store, writes } = fakeStore();

    const resolved = await resolve(store, NOW);

    expect(resolved.source).toBe("snapshot");
    expect(resolved.surfaces).toEqual(SURFACES);
    expect(writes.cached).toEqual([]);
    // Pin the REASON, not just the verdict: "snapshot" is also what the
    // no-key path returns, so without this the test would still pass if the
    // key mock silently stopped working.
    expect(resolved.reason).toContain("did not verify");
  });
});
