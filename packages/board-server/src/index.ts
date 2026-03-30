import http from 'node:http';
import { WsHub } from './ws/hub.js';
import { createHttpApp } from './http/server.js';
import { taskRunner } from './execution/runner.js';

const PORT = Number(process.env.BOARD_PORT ?? 4800);

// Create hub first so routes can reference it
const httpServer = http.createServer();

// Register before WsHub so this listener fires before ws re-emits on WebSocketServer
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[board-server] port ${PORT} already in use — exiting cleanly`);
    process.exit(0); // Clean exit so launchd KeepAlive does NOT restart
  }
  throw err;
});

const hub = new WsHub(httpServer);
const app = createHttpApp(hub);
httpServer.on('request', app);

const HOST = process.env.BOARD_HOST ?? '127.0.0.1';

httpServer.listen(PORT, HOST, () => {
  console.log(`[board-server] HTTP + WebSocket listening on ${HOST}:${PORT}`);
});

function shutdown() {
  // Kill any running task processes to prevent orphans
  taskRunner.stopAll();
  hub.close();
  httpServer.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { hub };
