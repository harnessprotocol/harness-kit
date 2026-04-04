import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import * as store from '../store/yaml-store.js';
import { FileWatcher } from '../store/file-watcher.js';

export type BoardEvent =
  | { type: 'project_updated'; slug: string; project: ReturnType<typeof store.readProject> }
  | { type: 'roadmap_updated'; slug: string }
  | { type: 'competitors_updated'; slug: string }
  | { type: 'connected'; message: string };

export class WsHub {
  private wss: WebSocketServer;
  private watcher: FileWatcher;

  constructor(httpServer: Server) {
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.watcher = new FileWatcher(store.projectsDir());

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      const hello: BoardEvent = { type: 'connected', message: 'Harness Board connected' };
      ws.send(JSON.stringify(hello));

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

    this.watcher.on('roadmap_updated', ({ slug }: { slug: string }) => {
      this.broadcast({ type: 'roadmap_updated', slug });
    });

    this.watcher.on('competitors_updated', ({ slug }: { slug: string }) => {
      this.broadcast({ type: 'competitors_updated', slug });
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
  notifyProjectChanged(slug: string): void {
    const project = store.readProject(slug);
    if (!project) return;
    const event: BoardEvent = { type: 'project_updated', slug, project };
    this.broadcast(event);
  }

  close(): void {
    this.watcher.stop();
    this.wss.close();
  }
}
