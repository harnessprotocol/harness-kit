import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as signEd } from "node:crypto";
import { loadDefinitions } from "../src/definitions/feed.js";
import type { FeedOptions, PublisherKey } from "../src/definitions/feed.js";
import { NodeSignatureVerifier } from "../src/definitions/providers-node.js";
import type { FetchResult, Fetcher } from "../src/definitions/providers.js";
import { toBundle } from "../src/definitions/bundle.js";
import { SURFACES, getSurface } from "../src/surfaces/registry.js";

/**
 * The definitions feed (AC-25, ADR 0004). This data names config-store paths
 * and installer binaries, so these tests use REAL Ed25519 keys and a real
 * verifier — a stub verifier would prove nothing about the one property that
 * matters.
 */

const MATRIX = { "claude-code": { "mcp-server": { read: "native" } } };

function bundleBytes(bundleNumber: number, surfaces = SURFACES): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify(toBundle({ bundleNumber, surfaces, capabilityMatrix: MATRIX })),
  );
}

/** A real keypair; `raw` is the 32-byte public key the feed compares against. */
function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return {
    privateKey,
    raw: new Uint8Array(der.subarray(der.length - 32)),
    sign: (bytes: Uint8Array) => new Uint8Array(signEd(null, bytes, privateKey)),
  };
}

/** Serves a fixed map of URL → result. */
function fetcher(routes: Record<string, FetchResult>): Fetcher {
  return {
    async get(url) {
      return routes[url] ?? { status: "not-found" };
    },
  };
}

const BASE = "https://harnesskit.ai/definitions/v1";
const BODY_URL = `${BASE}/definitions.json`;
const SIG_URL = `${BASE}/definitions.json.sig`;

function options(over: Partial<FeedOptions> = {}): FeedOptions {
  return {
    fetcher: fetcher({}),
    verifier: new NodeSignatureVerifier(),
    baseUrl: BASE,
    publisherKeys: [],
    snapshot: toBundle({ bundleNumber: 1, surfaces: SURFACES, capabilityMatrix: MATRIX }),
    now: "2026-09-08T00:00:00.000Z",
    ...over,
  };
}

describe("a correctly signed bundle is accepted", () => {
  it("uses the remote definitions and reports no fallback", async () => {
    const key = keypair();
    const bytes = bundleBytes(7);
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: key.sign(bytes) },
        }),
      }),
    );
    expect(loaded.source).toBe("remote");
    expect(loaded.reason).toBeUndefined();
    expect(loaded.bundle.bundleNumber).toBe(7);
  });

  it("carries a CHANGED config path through, which is the point of the feed (AC-26)", async () => {
    // A path moving without an app release is the reason this exists.
    const moved = SURFACES.map((surface) =>
      surface.id !== "claude-code"
        ? surface
        : {
            ...surface,
            stores: surface.stores.map((store) =>
              store.kind === "mcp-server" && store.scope === "user"
                ? { ...store, path: ".claude/moved-mcp.json" }
                : store,
            ),
          },
    );
    const key = keypair();
    const bytes = bundleBytes(8, moved);
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: key.sign(bytes) },
        }),
      }),
    );
    expect(loaded.source).toBe("remote");
    const store = loaded.bundle.surfaces
      .find((s) => s.id === "claude-code")
      ?.stores.find((s) => s.kind === "mcp-server" && s.scope === "user");
    expect(store?.path).toBe(".claude/moved-mcp.json");
    // The compiled-in registry is untouched — the feed does not mutate it.
    expect(
      getSurface("claude-code").stores.find((s) => s.kind === "mcp-server" && s.scope === "user")
        ?.path,
    ).toBe(".claude.json");
  });
});

describe("an unverifiable bundle never reaches the parser", () => {
  it("rejects a signature from a key this build does not know", async () => {
    const publisher = keypair();
    const attacker = keypair();
    const bytes = bundleBytes(9);
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: publisher.raw }],
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: attacker.sign(bytes) },
        }),
      }),
    );
    expect(loaded.source).toBe("snapshot");
    expect(loaded.reason).toContain("did not verify");
  });

  it("rejects a body altered after signing, by a single byte", async () => {
    const key = keypair();
    const bytes = bundleBytes(9);
    const signature = key.sign(bytes);
    const tampered = Uint8Array.from(bytes);
    tampered[tampered.length - 2] ^= 0x01;
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes: tampered },
          [SIG_URL]: { status: "ok", bytes: signature },
        }),
      }),
    );
    expect(loaded.source).toBe("snapshot");
  });

  it("does not parse the payload when the signature fails", async () => {
    // Verification precedes decoding on purpose: parsing first would run the
    // JSON parser and every bundle validator over attacker-controlled bytes.
    // Unsigned garbage that would CRASH the decoder must be refused for the
    // signature, not survive to reach it.
    const key = keypair();
    const attacker = keypair();
    const junk = new TextEncoder().encode("{".repeat(50_000));
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes: junk },
          [SIG_URL]: { status: "ok", bytes: attacker.sign(junk) },
        }),
      }),
    );
    expect(loaded.source).toBe("snapshot");
    expect(loaded.reason).toContain("did not verify");
    expect(loaded.reason).not.toContain("JSON");
  });

  it("treats a malformed key as a failed verification, not an exception", async () => {
    const key = keypair();
    const bytes = bundleBytes(9);
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "bad", publicKey: new Uint8Array([1, 2, 3]) }],
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: key.sign(bytes) },
        }),
      }),
    );
    expect(loaded.source).toBe("snapshot");
  });
});

describe("anti-rollback", () => {
  it("refuses a genuinely signed OLDER bundle", async () => {
    // The attack a signature alone does not stop: replay a real, correctly
    // signed bundle from before a path or permission was tightened.
    const key = keypair();
    const bytes = bundleBytes(3);
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        highestSeenBundleNumber: 12,
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: key.sign(bytes) },
        }),
      }),
    );
    expect(loaded.source).toBe("snapshot");
    expect(loaded.reason).toContain("refusing a rollback");
  });

  it("accepts the same number again, which is a re-fetch and not a rollback", async () => {
    const key = keypair();
    const bytes = bundleBytes(12);
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        highestSeenBundleNumber: 12,
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: key.sign(bytes) },
        }),
      }),
    );
    expect(loaded.source).toBe("remote");
  });

  it("takes the floor from the machine's history, not from the cache", async () => {
    // A cache an attacker can DELETE must not also reset the rollback floor.
    const key = keypair();
    const old = bundleBytes(2);
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        highestSeenBundleNumber: 30,
        cached: undefined,
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes: old },
          [SIG_URL]: { status: "ok", bytes: key.sign(old) },
        }),
      }),
    );
    expect(loaded.source).toBe("snapshot");
    expect(loaded.reason).toContain("refusing a rollback");
  });
});

describe("falling back, and saying so (AC-25)", () => {
  it("uses the cache when the feed is unreachable", async () => {
    const key = keypair();
    const bytes = bundleBytes(5);
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        cached: { bytes, signature: key.sign(bytes) },
        fetcher: fetcher({
          [BODY_URL]: { status: "failed", reason: "getaddrinfo ENOTFOUND" },
          [SIG_URL]: { status: "failed", reason: "getaddrinfo ENOTFOUND" },
        }),
      }),
    );
    expect(loaded.source).toBe("cache");
    expect(loaded.reason).toContain("could not be reached");
    expect(loaded.bundle.bundleNumber).toBe(5);
  });

  it("RE-VERIFIES the cache rather than trusting it", async () => {
    // The cache is a file any process running as this user can rewrite.
    const key = keypair();
    const attacker = keypair();
    const bytes = bundleBytes(5);
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        cached: { bytes, signature: attacker.sign(bytes) },
        fetcher: fetcher({ [BODY_URL]: { status: "not-found" }, [SIG_URL]: { status: "not-found" } }),
      }),
    );
    expect(loaded.source).toBe("snapshot");
    expect(loaded.reason).toContain("cached definitions are unusable");
  });

  it("always states the reason when it is not using remote definitions", async () => {
    const loaded = await loadDefinitions(options());
    expect(loaded.source).toBe("snapshot");
    expect(loaded.reason).toBeTypeOf("string");
    expect((loaded.reason as string).length).toBeGreaterThan(0);
  });

  it("refuses a non-https feed without fetching anything", async () => {
    let called = false;
    const loaded = await loadDefinitions(
      options({
        baseUrl: "http://harnesskit.ai/definitions/v1",
        fetcher: {
          async get() {
            called = true;
            return { status: "not-found" };
          },
        },
      }),
    );
    expect(loaded.source).toBe("snapshot");
    expect(loaded.reason).toContain("not https");
    expect(called).toBe(false);
  });

  it("never throws, whatever the feed does", async () => {
    for (const result of [
      { status: "failed", reason: "boom" } as const,
      { status: "not-found" } as const,
      { status: "ok", bytes: new Uint8Array([0xff, 0xfe]) } as const,
    ]) {
      const loaded = await loadDefinitions(
        options({ fetcher: fetcher({ [BODY_URL]: result, [SIG_URL]: result }) }),
      );
      expect(loaded.source).toBe("snapshot");
    }
  });
});

describe("key rotation", () => {
  const bytesFor = (n: number) => bundleBytes(n);

  it("still accepts a bundle signed by an outgoing key before it expires", async () => {
    const outgoing = keypair();
    const incoming = keypair();
    const bytes = bytesFor(10);
    const keys: PublisherKey[] = [
      { id: "old", publicKey: outgoing.raw, notAfter: "2026-12-01T00:00:00.000Z" },
      { id: "new", publicKey: incoming.raw },
    ];
    const loaded = await loadDefinitions(
      options({
        publisherKeys: keys,
        now: "2026-09-08T00:00:00.000Z",
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: outgoing.sign(bytes) },
        }),
      }),
    );
    expect(loaded.source).toBe("remote");
  });

  it("stops accepting that key once it has expired", async () => {
    const outgoing = keypair();
    const bytes = bytesFor(10);
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [
          { id: "old", publicKey: outgoing.raw, notAfter: "2026-01-01T00:00:00.000Z" },
        ],
        now: "2026-09-08T00:00:00.000Z",
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: outgoing.sign(bytes) },
        }),
      }),
    );
    expect(loaded.source).toBe("snapshot");
  });
});
