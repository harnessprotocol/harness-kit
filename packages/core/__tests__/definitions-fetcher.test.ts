import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpsFetcher } from "../src/definitions/fetcher.js";

/**
 * `HttpsFetcher`'s transport guarantees.
 *
 * Platform-neutral on purpose: the same class serves the CLI and the Tauri
 * webview, so these tests cover both. It used only web standards all along,
 * which is why it moved out of the node-only entry point.
 *
 * These had NO test: every control could be deleted and the whole suite
 * stayed green while the PR asserted each as a fact.
 *
 * `fetch` is stubbed rather than served, deliberately. What is under test is
 * this class's own control flow — redirect bounding, cap enforcement while
 * READING, deadline propagation — and a stub drives every branch faithfully.
 * (Contrast the signature tests, which use real keys, because there the
 * cryptography is the thing being checked rather than the plumbing.) A real
 * server would need https, and adding a loopback-http exemption to production
 * code to make a test easier is how a guarantee quietly stops holding.
 */

const fetcher = new HttpsFetcher();
const limits = { maxBytes: 2 * 1024 * 1024, timeoutMs: 5_000 };

afterEach(() => vi.unstubAllGlobals());

/** A Response whose body streams `chunks`, counting what is actually read. */
function streaming(chunks: Uint8Array[], counter: { read: number }): Response {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) return controller.close();
      const chunk = chunks[index++];
      counter.read += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  return new Response(body, { status: 200 });
}

describe("transport refusals", () => {
  it("refuses a non-https URL without connecting", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const result = await fetcher.get("http://harnesskit.ai/definitions.json", limits);
    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.reason : "").toContain("non-https");
    expect(spy).not.toHaveBeenCalled();
  });

  it("degrades on a malformed URL instead of throwing", async () => {
    // `new URL()` sat above the try, so a typo'd feed URL took the process
    // down rather than falling back to the snapshot.
    vi.stubGlobal("fetch", vi.fn());
    for (const bad of ["https://[", "https://a b.com/x", "https://%zz/x"]) {
      const result = await fetcher.get(bad, limits);
      expect(result.status, bad).toBe("failed");
    }
  });
});

describe("redirects", () => {
  it("stops a same-origin LOOP rather than following it forever", async () => {
    // The origin pin means a self-referential 302 is the one redirect this
    // follows — the shape of an infinite loop, reachable from a single CDN
    // misconfiguration with no attacker involved. Unbounded recursion spun
    // 100k hops in 156ms, leaking a timer and a controller per hop.
    let hops = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      hops += 1;
      return new Response(null, { status: 302, headers: { location: url } });
    });
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.reason : "").toContain("too many times");
    expect(hops).toBeLessThan(20);
  });

  it("follows a bounded number of same-origin hops", async () => {
    let hops = 0;
    vi.stubGlobal("fetch", async () => {
      hops += 1;
      return hops < 3
        ? new Response(null, {
            status: 302,
            headers: { location: `https://harnesskit.ai/hop${hops}` },
          })
        : new Response("done", { status: 200 });
    });
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    expect(result.status).toBe("ok");
  });

  it("refuses a redirect that leaves the origin", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(null, { status: 302, headers: { location: "https://evil.example/x" } }),
    );
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    expect(result.status === "failed" ? result.reason : "").toContain("off its own origin");
  });

  it("refuses an https to http downgrade on the same host", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(null, { status: 302, headers: { location: "http://harnesskit.ai/x" } }),
    );
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    // Asserting only `status === "failed"` passed with the origin pin
    // deleted: the recursive call's own non-https guard produced the same
    // verdict, so the test never exercised the comparison it is named for.
    // The reason is what tells the two guards apart.
    expect(result.status === "failed" ? result.reason : "").toContain("off its own origin");
  });

  it("names an OPAQUE redirect instead of reporting 'answered 0'", async () => {
    // A browser engine turns `redirect: "manual"` into an opaque redirect —
    // status 0, empty headers, type "opaqueredirect" — rather than a readable
    // 3xx. Node never produces one, so this shape can only be simulated; the
    // desktop is where it would actually occur, and it would otherwise
    // surface as the meaningless "the feed answered 0".
    vi.stubGlobal("fetch", async () => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, "type", { value: "opaqueredirect" });
      Object.defineProperty(response, "status", { value: 0 });
      Object.defineProperty(response, "ok", { value: false });
      return response;
    });
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    expect(result.status).toBe("failed");
    const reason = result.status === "failed" ? result.reason : "";
    expect(reason).toContain("does not expose the target");
    expect(reason).not.toContain("answered 0");
  });

  it("refuses a redirect with no target", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 302 }));
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    expect(result.status === "failed" ? result.reason : "").toContain("without a target");
  });

  it("bounds the whole chain by ONE deadline, not one per hop", async () => {
    // A per-hop timeout bounds no chain: each hop resets it, so N hops take N
    // times as long as the caller asked to wait.
    vi.stubGlobal("fetch", async (url: string) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return new Response(null, { status: 302, headers: { location: url } });
    });
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", {
      maxBytes: 4096,
      timeoutMs: 120,
    });
    expect(result.status).toBe("failed");
    // The REASON is what distinguishes the deadline from the redirect bound:
    // with a per-hop timeout the chain would instead run out of hops, and an
    // elapsed-time assertion alone cannot tell those apart.
    expect(result.status === "failed" ? result.reason : "").toContain("did not answer within");
  });

  it("ARMS the abort signal, so one hung request is cut off too", async () => {
    // The test above passes entirely on the `remaining <= 0` check BETWEEN
    // hops, so replacing `controller.abort()` with a no-op kept the whole
    // suite green. A single request that never answers has no next hop to
    // check: only the signal stops it. This stub honours the signal the way
    // undici does, which is what makes the assertion meaningful.
    let aborted = false;
    vi.stubGlobal("fetch", (_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          const error = new Error("This operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    const started = Date.now();
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", {
      maxBytes: 4096,
      timeoutMs: 100,
    });
    expect(aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(result.status === "failed" ? result.reason : "").toContain("did not answer within");
  });
});

describe("body caps", () => {
  it("stops READING at the cap rather than buffering then complaining", async () => {
    // `arrayBuffer()` read everything first: 1.5 GiB resident against a 2 MiB
    // cap, from a response with no content-length so the header check was
    // skipped entirely.
    const counter = { read: 0 };
    const chunk = new Uint8Array(16 * 1024);
    const chunks = Array.from({ length: 512 }, () => chunk); // 8 MiB available
    vi.stubGlobal("fetch", async () => streaming(chunks, counter));
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", {
      maxBytes: 64 * 1024,
      timeoutMs: 5_000,
    });
    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.reason : "").toContain("larger than");
    // Read only a little past the cap, not the whole 8 MiB on offer.
    expect(counter.read).toBeLessThan(256 * 1024);
  });

  it("honours content-length over the cap, even when the body would fit", async () => {
    // The discriminator: a tiny body under a huge declared length. Reading it
    // would SUCCEED, so a failure here can only come from the header check
    // firing first. (Asserting "zero bytes read" is not observable — the
    // Response constructor pulls the stream itself.)
    vi.stubGlobal("fetch", async () =>
      new Response("tiny", {
        status: 200,
        headers: { "content-length": String(10 * 1024 * 1024) },
      }),
    );
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", {
      maxBytes: 4096,
      timeoutMs: 5_000,
    });
    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.reason : "").toContain("larger than");
  });

  it("ignores a nonsense content-length and falls back to the read cap", async () => {
    // `Number("not-a-number")` is NaN and `NaN > maxBytes` is already false,
    // so this case passes with the `Number.isFinite` guard deleted. The guard
    // exists for a literal `Infinity`, which is the case below.
    vi.stubGlobal("fetch", async () =>
      new Response("tiny", { status: 200, headers: { "content-length": "not-a-number" } }),
    );
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    expect(result.status).toBe("ok");
  });

  it("treats an Infinity content-length as unknown, deferring to the read cap", async () => {
    // This is the case the isFinite guard actually changes: without it,
    // `Infinity > maxBytes` rejects a body that in fact fits.
    vi.stubGlobal("fetch", async () =>
      new Response("tiny", { status: 200, headers: { "content-length": "Infinity" } }),
    );
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    expect(result.status).toBe("ok");
  });

  it("still enforces the cap when the body arrives one byte at a time", async () => {
    // A drip-fed body is the shape that made chunk RETENTION expensive: the
    // cap counted bytes while every chunk stayed in an array, so 4 MiB of
    // payload reached 2.2 GiB resident. The bytes-read cap must fire on this
    // shape exactly as it does on large chunks.
    //
    // The memory fix itself is deliberately NOT asserted here. Measured under
    // `node --expose-gc`, a 2 MiB drip cost 70-84 MiB retaining chunks and
    // 1.9-20.4 MiB with one growing buffer — a real 4-40x win, but the lower
    // figure swings by an order of magnitude with heap ordering and vitest
    // does not run with `--expose-gc`. A threshold across that range would
    // either flake or pass vacuously, which is worse than not asserting it.
    const counter = { read: 0 };
    const chunks = Array.from({ length: 200_000 }, () => new Uint8Array(1));
    vi.stubGlobal("fetch", async () => streaming(chunks, counter));
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", {
      maxBytes: 64 * 1024,
      timeoutMs: 30_000,
    });
    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.reason : "").toContain("larger than");
    // Stopped at the cap rather than draining all 200k chunks.
    expect(counter.read).toBeLessThan(70 * 1024);
  });

  it("reassembles a drip-fed body byte-for-byte", async () => {
    // Growing one buffer instead of concatenating chunks is only correct if
    // the bytes still come back in order and intact.
    const counter = { read: 0 };
    const expected = new Uint8Array(200_000).map((_, index) => index % 251);
    const chunks: Uint8Array[] = [];
    for (let at = 0; at < expected.length; at += 7) chunks.push(expected.subarray(at, at + 7));
    vi.stubGlobal("fetch", async () => streaming(chunks, counter));
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    expect(result.status).toBe("ok");
    expect(result.status === "ok" ? Array.from(result.bytes) : []).toEqual(Array.from(expected));
  });

  it("returns a body that fits", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"ok":true}', { status: 200 }));
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    expect(result.status).toBe("ok");
    expect(
      new TextDecoder().decode(result.status === "ok" ? result.bytes : new Uint8Array()),
    ).toBe('{"ok":true}');
  });
});

describe("status handling", () => {
  it("reports 404 as not-found, distinct from a failure", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
    expect((await fetcher.get("https://harnesskit.ai/x", limits)).status).toBe("not-found");
  });

  it("reports another error status as failed, naming it", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
    const result = await fetcher.get("https://harnesskit.ai/x", limits);
    expect(result.status === "failed" ? result.reason : "").toContain("503");
  });

  it("reports a thrown network error as failed rather than throwing", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("getaddrinfo ENOTFOUND harnesskit.ai");
    });
    const result = await fetcher.get("https://harnesskit.ai/x", limits);
    expect(result.status).toBe("failed");
    expect(result.status === "failed" ? result.reason : "").toContain("ENOTFOUND");
  });
});
