import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import * as store from '../store/yaml-store.js';
import { FileWatcher } from '../store/file-watcher.js';
import type { TaskExecution, Project } from '../types.js';

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export type BoardEvent =
  | { type: 'project_updated'; slug: string; project: ReturnType<typeof store.readProject> }
  | { type: 'connected'; message: string }
  | { type: 'task_execution_started'; slug: string; task_id: number; execution: TaskExecution }
  | { type: 'task_execution_stopped'; slug: string; task_id: number; execution: TaskExecution }
  | { type: 'task_phase_changed'; slug: string; task_id: number; phase: string; message?: string }
  | { type: 'task_log_line'; slug: string; task_id: number; line: string }
  | { type: 'task_progress'; slug: string; task_id: number; progress: number; phase: string };

export class WsHub {
  private wss: WebSocketServer;
  private watcher: FileWatcher;
  private logSubscriptions = new Map<WebSocket, Set<number>>();

  constructor(httpServer: Server) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      maxPayload: 64 * 1024, // 64KB max message size
      verifyClient: ({ origin }: { origin?: string }) => {
        // Allow connections with no origin (non-browser clients like Tauri)
        if (!origin) return true;
        return LOCALHOST_ORIGIN.test(origin);
      },
    });
    this.watcher = new FileWatcher(store.projectsDir());

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      const hello: BoardEvent = { type: 'connected', message: 'Harness Board connected' };
      ws.send(JSON.stringify(hello));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as { type: string; task_id?: number };
          if (msg.type === 'subscribe_logs' && typeof msg.task_id === 'number') {
            this.subscribeLogs(ws, msg.task_id);
          } else if (msg.type === 'unsubscribe_logs' && typeof msg.task_id === 'number') {
            this.unsubscribeLogs(ws, msg.task_id);
          }
        } catch { /* ignore malformed messages */ }
      });

      ws.on('close', () => {
        this.logSubscriptions.delete(ws);
      });

      ws.on('error', (err) => console.error('[WsHub] client error:', err));
    });

    // When a YAML file changes (externally or via MCP subprocess), push the updated project
    this.watcher.on('change', ({ filename }: { filename: string }) => {
      const slug = filename.replace(/\.yaml$/, '');
      const project = store.readProject(slug);
      if (!project) return;
      const event: BoardEvent = { type: 'project_updated', slug, project };
      this.broadcast(event);
    });

    this.watcher.on('error', (err: unknown) => {
      console.error('[WsHub] file watcher error:', err);
    });

    this.watcher.start();
  }

  broadcast(event: BoardEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /** Call after any in-process store write to push immediate updates (no watcher latency) */
  notifyProjectChanged(slug: string, project?: Project): void {
    const p = project ?? store.readProject(slug);
    if (!p) return;
    const event: BoardEvent = { type: 'project_updated', slug, project: p };
    this.broadcast(event);
  }

  subscribeLogs(ws: WebSocket, taskId: number): void {
    let subs = this.logSubscriptions.get(ws);
    if (!subs) {
      subs = new Set();
      this.logSubscriptions.set(ws, subs);
    }
    subs.add(taskId);
  }

  unsubscribeLogs(ws: WebSocket, taskId: number): void {
    const subs = this.logSubscriptions.get(ws);
    if (subs) subs.delete(taskId);
  }

  broadcastLogLine(slug: string, taskId: number, line: string): void {
    const event: BoardEvent = { type: 'task_log_line', slug, task_id: taskId, line };
    const payload = JSON.stringify(event);
    for (const [ws, subs] of this.logSubscriptions) {
      if (subs.has(taskId) && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  broadcastTaskEvent(event: BoardEvent): void {
    this.broadcast(event);
  }

  close(): void {
    this.watcher.stop();
    this.wss.close();
  }
}
