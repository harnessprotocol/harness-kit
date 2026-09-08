import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as signEd } from "node:crypto";
import { loadDefinitions } from "../src/definitions/feed.js";
import type { FeedOptions, PublisherKey } from "../src/definitions/feed.js";
import { NodeFetcher, NodeSignatureVerifier } from "../src/definitions/providers-node.js";
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
    // The payload cases carry a REAL signature. An earlier version used the
    // default empty key list, so the signature check rejected first and the
    // decoder was never reached — the assertion held for a reason that had
    // nothing to do with the test's name.
    const key = keypair();
    const cases = [
      // Each case pins the reason to ITS OWN branch. Asserting only "not
      // 'did not verify'" let the UTF-8 case pass with `fatal: true` removed:
      // 0xff 0xfe became two replacement characters and fell through to the
      // JSON branch, which the assertions could not tell apart.
      { bytes: new Uint8Array([0xff, 0xfe]), label: "invalid UTF-8", expect: "not valid UTF-8" },
      { bytes: new TextEncoder().encode("{not json"), label: "invalid JSON", expect: "not valid JSON" },
      { bytes: new TextEncoder().encode("[]"), label: "JSON that is not a bundle", expect: "not usable by this build" },
      { bytes: new TextEncoder().encode(JSON.stringify({ formatVersion: 99 })), label: "a newer format", expect: "not usable by this build" },
    ];
    for (const { bytes, label, expect: fragment } of cases) {
      const loaded = await loadDefinitions(
        options({
          publisherKeys: [{ id: "k1", publicKey: key.raw }],
          fetcher: fetcher({
            [BODY_URL]: { status: "ok", bytes },
            [SIG_URL]: { status: "ok", bytes: key.sign(bytes) },
          }),
        }),
      );
      expect(loaded.source, label).toBe("snapshot");
      // Reached the DECODER, not the signature check — that is the point.
      expect(loaded.reason, label).not.toContain("did not verify");
      expect(loaded.reason, label).toContain(fragment);
    }

    for (const result of [
      { status: "failed", reason: "boom" } as const,
      { status: "not-found" } as const,
    ]) {
      const loaded = await loadDefinitions(
        options({ fetcher: fetcher({ [BODY_URL]: result, [SIG_URL]: result }) }),
      );
      expect(loaded.source).toBe("snapshot");
    }
  });

  it("degrades when an injected provider REJECTS instead of returning", async () => {
    // Every case above supplies a well-behaved provider that returns a
    // FetchResult. But these are interfaces the CALLER implements, and the
    // next one planned is a Tauri `invoke` — which rejects whenever the Rust
    // side returns Err. Nothing here caught that, so the one function whose
    // whole purpose is degrading instead of crashing took the app down.
    const key = keypair();
    const bytes = bundleBytes(9);

    const thrownFetcher = await loadDefinitions(
      options({
        fetcher: {
          get: () => Promise.reject(new Error("invoke('fetch_definitions') failed")),
        },
      }),
    );
    expect(thrownFetcher.source).toBe("snapshot");
    expect(thrownFetcher.reason).toContain("the fetcher threw");

    const thrownVerifier = await loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        verifier: {
          verifyEd25519: () => Promise.reject(new Error("command not found")),
        },
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: key.sign(bytes) },
        }),
      }),
    );
    expect(thrownVerifier.source).toBe("snapshot");
    // A verifier that throws is a verifier that failed — no trust granted.
    expect(thrownVerifier.reason).toContain("did not verify");

    // A synchronous throw, not just a rejected promise.
    const syncThrow = await loadDefinitions(
      options({
        fetcher: {
          get: () => {
            throw new Error("synchronous boom");
          },
        },
      }),
    );
    expect(syncThrow.source).toBe("snapshot");
  });

  it("refuses a limit that would not bound the response, rather than substituting one", async () => {
    // `NaN` compares false against every size, so `maxBytes: NaN` read an
    // unbounded body; a timeoutMs past 2^31 collapses setTimeout to ~1ms.
    // Both are the shape that made the rollback floor a no-op: a bad number
    // silently disarming the control it configures.
    for (const [field, value] of [
      ["maxBytes", Number.NaN],
      ["maxBytes", 0],
      ["maxBytes", -1],
      ["timeoutMs", Number.NaN],
      ["timeoutMs", Number.POSITIVE_INFINITY],
      ["timeoutMs", 2_147_483_648],
    ] as const) {
      let called = false;
      const loaded = await loadDefinitions(
        options({
          [field]: value,
          fetcher: {
            get: () => {
              called = true;
              return Promise.resolve({ status: "not-found" as const });
            },
          },
        }),
      );
      const label = `${field}=${String(value)}`;
      expect(loaded.source, label).toBe("snapshot");
      expect(loaded.reason, label).toContain(`unusable ${field}`);
      expect(called, label).toBe(false);
    }
  });

  it("refuses a clock it cannot read, rather than blaming the signature", async () => {
    // A timezone-less `now` used to leave perpetual keys trusted while
    // revoking every key that had a notAfter — a split failure, and the user
    // was told the signature did not verify.
    const key = keypair();
    const bytes = bundleBytes(9);
    for (const now of ["not a date", "2026-09-08T00:00:00", ""]) {
      const loaded = await loadDefinitions(
        options({
          now,
          publisherKeys: [{ id: "k1", publicKey: key.raw }],
          fetcher: fetcher({
            [BODY_URL]: { status: "ok", bytes },
            [SIG_URL]: { status: "ok", bytes: key.sign(bytes) },
          }),
        }),
      );
      expect(loaded.source, now).toBe("snapshot");
      expect(loaded.reason, now).toContain("UTC offset");
    }
  });

  it("degrades instead of throwing on a malformed feed URL", async () => {
    // `new URL()` on a typo'd baseUrl used to take the process down.
    for (const bad of ["https://[", "https://harness kit.ai/definitions/v1", "https://%zz/x"]) {
      const loaded = await loadDefinitions(
        options({ baseUrl: bad, fetcher: new NodeFetcher() }),
      );
      expect(loaded.source, bad).toBe("snapshot");
    }
  });
});

describe("notAfter is an instant, not a string", () => {
  // Comparing ISO-8601 as strings looked fine and was not. Each case below
  // is a key that IS expired by Date.parse but sorted as unexpired.
  const bytes = bundleBytes(10);

  async function accepted(notAfter: string, now: string): Promise<boolean> {
    const key = keypair();
    const loaded = await loadDefinitions(
      options({
        publisherKeys: [{ id: "old", publicKey: key.raw, notAfter }],
        now,
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: key.sign(bytes) },
        }),
      }),
    );
    return loaded.source === "remote";
  }

  it("rejects a key whose expiry carries a UTC offset", async () => {
    expect(await accepted("2026-09-08T00:00:00+09:00", "2026-09-07T20:00:00.000Z")).toBe(false);
  });

  it("rejects a second-precision expiry against a millisecond clock", async () => {
    expect(await accepted("2026-09-08T00:00:00Z", "2026-09-08T00:00:00.500Z")).toBe(false);
  });

  it("rejects an unpadded expiry, which sorted after everything", async () => {
    // The worst of them: a key revoked 2026-09-08, written with one missing
    // zero, stayed honoured months past revocation.
    expect(await accepted("2026-9-8", "2026-12-20T00:00:00.000Z")).toBe(false);
  });

  it("treats an UNPARSEABLE expiry as expired, not as no-expiry", async () => {
    // Failing open here would mean a typo in a revocation silently grants the
    // key eternal life.
    expect(await accepted("revoked", "2026-09-08T00:00:00.000Z")).toBe(false);
  });

  it("still accepts a key that genuinely has not expired", async () => {
    expect(await accepted("2027-01-01T00:00:00.000Z", "2026-09-08T00:00:00.000Z")).toBe(true);
  });

  it("refuses an expiry with no UTC offset, which the host timezone would resolve", async () => {
    // `2026-09-08T00:00:00` is valid ISO-8601 and Date.parse reads it in the
    // HOST's zone: the same key expired in Tokyo and stayed honoured in
    // Honolulu 26 hours later, so a bundle verified on one machine and not
    // its neighbour. Ambiguous is refused rather than guessed.
    expect(await accepted("2026-09-08T00:00:00", "2026-09-08T02:00:00.000Z")).toBe(false);
    expect(await accepted("2027-01-01T00:00:00", "2026-09-08T02:00:00.000Z")).toBe(false);
  });

  it("makes the notAfter boundary EXCLUSIVE, at the instant itself", async () => {
    // RFC 5280 treats notAfter as inclusive; this does not. Pinned by test so
    // the next reader finds the answer instead of re-deriving it.
    const instant = "2026-09-08T00:00:00.000Z";
    expect(await accepted(instant, instant)).toBe(false);
    expect(await accepted(instant, "2026-09-07T23:59:59.999Z")).toBe(true);
  });
});

describe("the verifier's key handling", () => {
  // The DER lengths in the SPKI prefix are fixed for 32 bytes and OpenSSL
  // ignores trailing data after the SEQUENCE, so an over-length key was
  // silently truncated to its first 32 and ACCEPTED — infinitely many
  // distinct key values acting as one key. Short keys failed on their own.
  const verifier = new NodeSignatureVerifier();

  it("refuses a public key that is not exactly 32 bytes", async () => {
    const key = keypair();
    const message = new TextEncoder().encode("definitions");
    const signature = key.sign(message);

    expect(await verifier.verifyEd25519(message, signature, key.raw)).toBe(true);

    for (const extra of [1, 32, 4096]) {
      const padded = new Uint8Array(key.raw.length + extra);
      padded.set(key.raw);
      expect(await verifier.verifyEd25519(message, signature, padded), `+${extra}`).toBe(false);
    }
    for (const short of [0, 31]) {
      expect(await verifier.verifyEd25519(message, signature, key.raw.subarray(0, short))).toBe(
        false,
      );
    }
  });

  it("returns false rather than throwing on a malformed signature", async () => {
    const key = keypair();
    const message = new TextEncoder().encode("definitions");
    for (const length of [0, 1, 63, 65, 128]) {
      expect(await verifier.verifyEd25519(message, new Uint8Array(length), key.raw)).toBe(false);
    }
  });
});

describe("anti-rollback cannot be disabled by a bad floor", () => {
  // An earlier version of this block asserted `toBe("remote")` for every
  // garbage floor — it accepted the rollback under a title saying the defence
  // could not be switched off, and under a comment saying the same. The
  // assertion and the name were opposites, and the name was right.
  const rollback = (floor: unknown, key: ReturnType<typeof keypair>) => {
    const bytes = bundleBytes(2);
    return loadDefinitions(
      options({
        publisherKeys: [{ id: "k1", publicKey: key.raw }],
        highestSeenBundleNumber: floor as number,
        fetcher: fetcher({
          [BODY_URL]: { status: "ok", bytes },
          [SIG_URL]: { status: "ok", bytes: key.sign(bytes) },
        }),
      }),
    );
  };

  it("REFUSES a rollback when the floor is present but unreadable", async () => {
    // A truncated ledger yields NaN; a JSON round-trip yields "30". Neither
    // is a floor of zero, and neither may mean "no protection" — a corrupt
    // machine history is a reason to distrust a replayed bundle, not to wave
    // it through. `n < NaN` is already false, which is why the previous
    // `Number.isInteger` guard did nothing for the case it was written for.
    const key = keypair();
    for (const floor of [Number.NaN, 1.5, "30", -1, null]) {
      const loaded = await rollback(floor, key);
      expect(loaded.source, String(floor)).toBe("snapshot");
      expect(loaded.reason, String(floor)).toContain("unreadable");
    }
  });

  it("still refuses a rollback against a real floor, and says the number", async () => {
    const key = keypair();
    const loaded = await rollback(30, key);
    expect(loaded.source).toBe("snapshot");
    expect(loaded.reason).toContain("older than 30");
  });

  it("accepts the bundle when no floor is recorded at all", async () => {
    // Absent is not the same as corrupt: a machine with no history yet has
    // nothing to roll back from.
    const key = keypair();
    const loaded = await rollback(undefined, key);
    expect(loaded.source).toBe("remote");
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
