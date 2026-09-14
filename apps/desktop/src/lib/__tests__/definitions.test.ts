import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { tauriVerifier, tauriDefinitionsStore, resolveDesktopDefinitions } = await import(
  "../definitions.js"
);

/**
 * The desktop's definitions drivers.
 *
 * The sequencing is core's and tested there; what these cover is the IPC
 * boundary, which is where this half can go wrong: an `invoke` that rejects,
 * a byte array that does not survive the round trip, and a verifier that
 * throws on the one path whose whole job is deciding trust.
 */

// NO mockReset/mockClear between tests, deliberately. Both clear
// `mock.results`, which drops vitest's stored copy of a rejected result
// before any handler is attached to that copy — Node then reports an
// unhandled rejection and the rejection test fails even though the code
// under test correctly returned `false`. Verified by probe: the verdict was
// `false` and the test still failed. Each test sets its own implementation,
// and the one case that cares about call history takes a baseline instead.
afterEach(() => vi.unstubAllGlobals());

describe("tauriVerifier", () => {
  it("passes bytes as plain arrays and returns the Rust verdict", async () => {
    invoke.mockResolvedValue(true);
    const ok = await tauriVerifier.verifyEd25519(
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
      new Uint8Array([4]),
    );
    expect(ok).toBe(true);
    expect(invoke).toHaveBeenLastCalledWith("verify_definitions_signature", {
      message: [1, 2],
      signature: [3],
      publicKey: [4],
    });
  });

  it("returns FALSE when invoke rejects, rather than throwing", async () => {
    // `invoke` rejects whenever the Rust side returns Err. A rejected promise
    // here is what crashed loadDefinitions before it wrapped its providers;
    // the driver must not rely on that wrapper existing.
    // mockImplementation, not mockRejectedValue: the latter builds the
    // rejected promise eagerly, so vitest flags it as unhandled before the
    // code under test ever gets to catch it.
    invoke.mockImplementation(async () => {
      throw new Error("command not found");
    });
    const verdict = await tauriVerifier.verifyEd25519(
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    );
    expect(verdict).toBe(false);
  });
});

describe("tauriDefinitionsStore", () => {
  it("round-trips the exact signed bytes through base64", async () => {
    // The cache is re-verified on load, so a byte that changes in transit is
    // a bundle that stops verifying. Includes 0x00 and 0xff, which a naive
    // string round-trip mangles.
    const payload = new Uint8Array([0, 1, 127, 128, 255, 42]);
    const signature = new Uint8Array(64).fill(7);

    invoke.mockResolvedValue(undefined);
    await tauriDefinitionsStore.putCachedDefinitions({
      bundleNumber: 9,
      fetchedAt: "2026-09-08T00:00:00.000Z",
      payload,
      signature,
    });
    const sent = invoke.mock.calls.at(-1)![1] as { entry: Record<string, string> };

    invoke.mockResolvedValue({
      bundleNumber: 9,
      fetchedAt: "2026-09-08T00:00:00.000Z",
      payloadB64: sent.entry.payloadB64,
      signatureB64: sent.entry.signatureB64,
    });
    const read = await tauriDefinitionsStore.getCachedDefinitions();

    expect(Array.from(read!.payload)).toEqual(Array.from(payload));
    expect(Array.from(read!.signature)).toEqual(Array.from(signature));
  });

  it("reports no cache for an absent row and for a corrupt one", async () => {
    invoke.mockResolvedValue(null);
    expect(await tauriDefinitionsStore.getCachedDefinitions()).toBeNull();

    invoke.mockResolvedValue({
      bundleNumber: 1,
      fetchedAt: "2026-09-08T00:00:00.000Z",
      payloadB64: "!!!not base64!!!",
      signatureB64: "!!!",
    });
    expect(await tauriDefinitionsStore.getCachedDefinitions()).toBeNull();
  });

  it("sends the floor as a number the Rust command can bind", async () => {
    invoke.mockResolvedValue(undefined);
    await tauriDefinitionsStore.recordBundleNumber(30, "2026-09-08T00:00:00.000Z");
    expect(invoke).toHaveBeenLastCalledWith("record_bundle_number", {
      bundleNumber: 30,
      at: "2026-09-08T00:00:00.000Z",
    });
  });
});

describe("resolveDesktopDefinitions", () => {
  it("returns the compiled-in registry without touching the network or IPC", async () => {
    // No publisher key is compiled in, so there is nothing to verify against
    // and no reason to fetch. This is the behaviour that ships today.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const callsBefore = invoke.mock.calls.length;

    const resolved = await resolveDesktopDefinitions("2026-09-08T00:00:00.000Z");

    expect(resolved.source).toBe("snapshot");
    expect(resolved.reason).toContain("no publisher key");
    expect(resolved.surfaces.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(invoke.mock.calls.length).toBe(callsBefore);
  });
});
