// packages/agent-server/src/ws.ts
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import { attachWs } from './runner/broadcaster.js';

export function createWsServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Expect ?taskId=N in URL
    const url = new URL(req.url ?? '/', 'http://localhost');
    const taskId = Number(url.searchParams.get('taskId') ?? '0');

    if (taskId) attachWs(taskId, ws as import('ws').WebSocket);
    ws.send(JSON.stringify({ type: 'connected' }));
  });

  return wss;
}
