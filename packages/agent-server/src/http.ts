// packages/agent-server/src/http.ts
import express from 'express';
import { z } from 'zod';
import { startAgent, stopAgent, steerAgent, pauseAgent, resumeAgent } from './runner/runner.js';
import { isRunning } from './runner/thread-manager.js';

const SerializableTaskSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().optional(),
  subtasks: z.array(z.object({
    id: z.number(), title: z.string(), status: z.string(), phase: z.string().optional(),
  })).default([]),
  worktree_path: z.string().optional(),
  default_model: z.string().optional(),
});

export function createServer() {
  const app = express();
  app.use(express.json());

  // CORS — restrict to Tauri app origins only
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'tauri://localhost');
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  const base = '/projects/:slug/tasks/:taskId';

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
    } catch (e) { res.status(400).json({ error: String(e) }); }
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
    } catch (e) { res.status(400).json({ error: String(e) }); }
  });

  // POST steer
  app.post(`${base}/steer`, async (req, res) => {
    const { slug } = req.params;
    const taskId = Number(req.params.taskId);
    const { message, task } = req.body;
    await steerAgent(slug, taskId, message, task);
    res.json({ ok: true });
  });

  // GET status
  app.get(`${base}/status`, (req, res) => {
    const taskId = Number(req.params.taskId);
    res.json({ running: isRunning(taskId) });
  });

  return app;
}
