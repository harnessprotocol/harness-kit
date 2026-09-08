import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeFetcher } from "../src/definitions/providers-node.js";

/**
 * `NodeFetcher`'s transport guarantees.
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

const fetcher = new NodeFetcher();
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
    expect(result.status).toBe("failed");
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
    vi.stubGlobal("fetch", async () =>
      new Response("tiny", { status: 200, headers: { "content-length": "not-a-number" } }),
    );
    const result = await fetcher.get("https://harnesskit.ai/definitions.json", limits);
    expect(result.status).toBe("ok");
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
