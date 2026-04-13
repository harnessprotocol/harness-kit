import { useCallback, useEffect, useRef } from "react";
import { BOARD_SERVER_BASE } from "../lib/board-api";

const WS_URL = BOARD_SERVER_BASE.replace(/^http/, "ws") + "/ws";

export function useWebSocket(onMessage: (event: MessageEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (evt) => onMessageRef.current(evt);

      ws.onclose = () => {
        if (!mountedRef.current) return;
        // Reconnect after 2s
        reconnectTimerRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    } catch {
      // WebSocket not available or server not running
      reconnectTimerRef.current = setTimeout(connect, 5000);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
