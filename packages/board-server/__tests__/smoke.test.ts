import request from "supertest";
import { describe, expect, it } from "vitest";
import { createHttpApp } from "../src/http/server.js";

describe("board-server smoke test", () => {
  it("GET /health returns ok", async () => {
    const app = createHttpApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});
