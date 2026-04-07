const sinks = new Map();
export function subscribe(taskId, sink) {
    if (!sinks.has(taskId))
        sinks.set(taskId, new Set());
    sinks.get(taskId).add(sink);
    return () => sinks.get(taskId)?.delete(sink);
}
export function emit(event) {
    sinks.get(event.taskId)?.forEach(s => s(event));
}
/** Attach a WebSocket client to receive events for a task */
export function attachWs(taskId, ws) {
    const unsub = subscribe(taskId, (event) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(event));
        }
    });
    ws.on('close', unsub);
}
