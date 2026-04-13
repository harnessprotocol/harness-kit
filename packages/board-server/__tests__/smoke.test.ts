import { describe, it, expect } from "vitest";
import request from "supertest";
import { createHttpApp } from "../src/http/server.js";

describe("board-server smoke test", () => {
  it("GET /health returns ok", async () => {
    const app = createHttpApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});
