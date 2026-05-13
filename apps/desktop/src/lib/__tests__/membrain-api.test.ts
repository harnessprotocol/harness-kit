import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyMembrainServer } from "../membrain-api";

function mockFetchSequence(responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("verifyMembrainServer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts the expected membrain stats shape and root app identity", async () => {
    const fetchMock = mockFetchSequence([
      Response.json({ entities: 3, relations: 2, episodes: 1 }),
      new Response("<html><title>membrain</title></html>", { status: 200 }),
    ]);

    await expect(verifyMembrainServer()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unexpected stats payloads", async () => {
    mockFetchSequence([
      Response.json({ status: "ok" }),
    ]);

    await expect(verifyMembrainServer()).resolves.toEqual({
      ok: false,
      reason: "membrain stats endpoint returned an unexpected shape.",
    });
  });

  it("rejects root pages that do not identify as membrain", async () => {
    mockFetchSequence([
      Response.json({ entities: 3, relations: 2, episodes: 1 }),
      new Response("<html><title>other app</title></html>", { status: 200 }),
    ]);

    await expect(verifyMembrainServer()).resolves.toEqual({
      ok: false,
      reason: "membrain web app identity could not be verified.",
    });
  });
});
