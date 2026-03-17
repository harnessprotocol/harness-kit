import http from 'node:http';
import { createHttpApp } from './http/server.js';
import { WsHub } from './ws/hub.js';

const PORT = Number(process.env.BOARD_PORT ?? 4800);

const app = createHttpApp();
const httpServer = http.createServer(app);
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
