'use client';

import { useEffect, useRef, useCallback } from 'react';

const WS_URL = `ws://localhost:${typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_BOARD_PORT ?? 4800) : 4800}/ws`;

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
