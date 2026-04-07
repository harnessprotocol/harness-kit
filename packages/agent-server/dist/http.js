// packages/agent-server/src/http.ts
import express from 'express';
import { startAgent, stopAgent, steerAgent } from './runner/runner.js';
import { isRunning } from './runner/thread-manager.js';
export function createServer() {
    const app = express();
    app.use(express.json());
    // CORS
    app.use((_req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });
    const base = '/projects/:slug/tasks/:taskId';
    // POST start
    app.post(`${base}/start`, async (req, res) => {
        const { slug } = req.params;
        const taskId = Number(req.params.taskId);
        const task = req.body.task; // full SerializableTask sent from desktop
        const opts = req.body.opts ?? {};
        try {
            startAgent(slug, task, opts); // intentionally not awaited — streams via WS
            res.json({ ok: true });
        }
        catch (e) {
            res.status(400).json({ error: String(e) });
        }
    });
    // POST stop
    app.post(`${base}/stop`, (req, res) => {
        stopAgent(Number(req.params.taskId));
        res.json({ ok: true });
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
