import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { createRouter } from './routes.js';
import type { WsHub } from '../ws/hub.js';

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Validate that slug/ID route params are safe (no path traversal) */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function validateParams(req: Request, res: Response, next: NextFunction): void {
  const { slug } = req.params;
  if (slug && !SAFE_SLUG.test(slug)) {
    res.status(400).json({ error: 'Invalid project slug' });
    return;
  }
  // Validate numeric IDs
  for (const key of ['taskId', 'epicId', 'subtaskId']) {
    const val = req.params[key];
    if (val !== undefined && (!/^\d+$/.test(val) || Number(val) < 0)) {
      res.status(400).json({ error: `Invalid ${key}` });
      return;
    }
  }
  next();
}

export function createHttpApp(hub?: WsHub): Express {
  const app = express();

  // CORS — strict localhost origin matching
  app.use((_req, res, next) => {
    const origin = _req.headers.origin;
    if (origin && LOCALHOST_ORIGIN.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // Param validation on all /api/v1 routes
  app.param('slug', (req, _res, next) => { next(); });
  app.use('/api/v1', validateParams);

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'harness-board' }));

  app.use('/api/v1', createRouter(hub));

  return app;
}
