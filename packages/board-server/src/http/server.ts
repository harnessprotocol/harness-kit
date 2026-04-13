import express, { type Express } from "express";
import { createRouter } from "./routes.js";

export function createHttpApp(): Express {
  const app = express();

  // CORS — allow localhost origins and the Tauri webview (tauri://localhost)
  app.use((_req, res, next) => {
    const origin = _req.headers.origin;
    if (
      origin &&
      (origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1") ||
        origin === "tauri://localhost")
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (_req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true, service: "harness-board" }));

  app.use("/api/v1", createRouter());

  return app;
}
