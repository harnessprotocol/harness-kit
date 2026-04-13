// packages/agent-server/src/runner/broadcaster.ts
import type WebSocket from "ws";
import type { AgentEvent } from "../types.js";

type EventSink = (event: AgentEvent) => void;
const sinks = new Map<number, Set<EventSink>>();

export function subscribe(taskId: number, sink: EventSink) {
  if (!sinks.has(taskId)) sinks.set(taskId, new Set());
  sinks.get(taskId)!.add(sink);
  return () => sinks.get(taskId)?.delete(sink);
}

/** Remove the subscriber set for a completed task to prevent unbounded map growth. */
export function clearSubscribers(taskId: number) {
  sinks.delete(taskId);
}

export function emit(event: AgentEvent) {
  sinks.get(event.taskId)?.forEach((s) => s(event));
}

/** Attach a WebSocket client to receive events for a task */
export function attachWs(taskId: number, ws: WebSocket) {
  const unsub = subscribe(taskId, (event) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });
  ws.on("close", unsub);
}
