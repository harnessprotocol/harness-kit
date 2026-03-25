import http from "node:http";
import { WebSocketServer } from "ws";
import { ChatRelay } from "./relay.js";

const PORT = Number(process.env.CHAT_PORT ?? 4801);

const httpServer = http.createServer();

// Register before WebSocketServer so this listener fires first
httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[chat-relay] port ${PORT} already in use — exiting cleanly`);
    process.exit(0); // Clean exit so process managers do NOT restart
  }
  throw err;
});

const wss = new WebSocketServer({ server: httpServer });
const relay = new ChatRelay(wss);

httpServer.listen(PORT, () => {
  console.log(`[chat-relay] WebSocket listening on :${PORT}`);
});

process.on("SIGINT", () => {
  relay.close();
  httpServer.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  relay.close();
  httpServer.close();
  process.exit(0);
});
