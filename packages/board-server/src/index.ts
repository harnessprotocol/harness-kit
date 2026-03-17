import http from 'node:http';
import { createHttpApp } from './http/server.js';
import { WsHub } from './ws/hub.js';

const PORT = Number(process.env.BOARD_PORT ?? 4800);

const app = createHttpApp();
const httpServer = http.createServer(app);

// Register before WsHub so this listener fires before ws re-emits on WebSocketServer
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[board-server] port ${PORT} already in use — exiting cleanly`);
    process.exit(0); // Clean exit so launchd KeepAlive does NOT restart
  }
  throw err;
});

const hub = new WsHub(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[board-server] HTTP + WebSocket listening on :${PORT}`);
});

process.on('SIGINT', () => {
  hub.close();
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  hub.close();
  httpServer.close();
  process.exit(0);
});

export { hub };
