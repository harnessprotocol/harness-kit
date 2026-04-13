// packages/agent-server/src/ws.ts

import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import { attachWs } from "./runner/broadcaster.js";
import { getOrCreateToken } from "./token.js";

export function createWsServer(httpServer: Server) {
  const token = getOrCreateToken();
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Auth: token must be passed as ?token=<secret> query parameter.
    // (WebSocket upgrade requests cannot carry Authorization headers in browser clients.)
    if (url.searchParams.get("token") !== token) {
      ws.close(1008, "Unauthorized");
      return;
    }

    const taskId = Number(url.searchParams.get("taskId") ?? "0");
    if (taskId) attachWs(taskId, ws as import("ws").WebSocket);
    ws.send(JSON.stringify({ type: "connected" }));
  });

  return wss;
}
