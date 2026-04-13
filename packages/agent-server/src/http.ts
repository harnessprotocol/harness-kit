// packages/agent-server/src/http.ts
import express from "express";
import { z } from "zod";
import { pauseAgent, resumeAgent, startAgent, steerAgent, stopAgent } from "./runner/runner.js";
import { isRunning } from "./runner/thread-manager.js";
import { getOrCreateToken } from "./token.js";

const SerializableTaskSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().optional(),
  subtasks: z
    .array(
      z.object({
        id: z.number(),
        title: z.string(),
        status: z.string(),
        phase: z.string().optional(),
      }),
    )
    .default([]),
  worktree_path: z.string().optional(),
  default_model: z.string().optional(),
});

const SteerBodySchema = z.object({
  task: SerializableTaskSchema,
  message: z.string().min(1).max(4000),
});

export function createServer() {
  const token = getOrCreateToken();
  const app = express();
  app.use(express.json());

  // CORS — restrict to Tauri app origins only
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "tauri://localhost");
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    next();
  });

  // Handle CORS preflight
  app.options("*", (_req, res) => res.sendStatus(204));

  // Auth middleware — all routes require Bearer token.
  // Token is stored in ~/.harness-kit/agent-server.token (mode 0600).
  app.use((req, res, next) => {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${token}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  });

  const base = "/projects/:slug/tasks/:taskId";

  // POST start
  app.post(`${base}/start`, async (req, res) => {
    const { slug } = req.params;
    const taskId = Number(req.params.taskId);
    const parsed = SerializableTaskSchema.safeParse(req.body.task);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const opts = req.body.opts ?? {};
    try {
      void startAgent(slug, parsed.data, opts); // intentionally not awaited — streams via WS
      res.json({ ok: true, taskId });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST stop
  app.post(`${base}/stop`, (req, res) => {
    stopAgent(Number(req.params.taskId));
    res.json({ ok: true });
  });

  // POST pause — abort the running graph; checkpoint preserves state for resume
  app.post(`${base}/pause`, (req, res) => {
    pauseAgent(Number(req.params.taskId));
    res.json({ ok: true });
  });

  // POST resume — restart graph from checkpoint
  app.post(`${base}/resume`, async (req, res) => {
    const { slug } = req.params;
    const parsed = SerializableTaskSchema.safeParse(req.body.task);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const opts = req.body.opts ?? {};
    try {
      void resumeAgent(slug, parsed.data, opts);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST steer
  app.post(`${base}/steer`, async (req, res) => {
    const { slug } = req.params;
    const taskId = Number(req.params.taskId);
    const parsed = SteerBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    try {
      await steerAgent(slug, taskId, parsed.data.message, parsed.data.task);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // GET status
  app.get(`${base}/status`, (req, res) => {
    const taskId = Number(req.params.taskId);
    res.json({ running: isRunning(taskId) });
  });

  return app;
}
