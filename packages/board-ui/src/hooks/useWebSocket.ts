import { useEffect, useRef, useCallback } from 'react';
import { getBoardApiBase } from '../lib/api';

function deriveWsUrl(): string {
  const base = getBoardApiBase();
  // If base is absolute URL like http://localhost:4800/api/v1
  if (base.startsWith('http')) {
    const url = new URL(base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    return url.toString();
  }
  // If base is relative (like /api/v1), derive from window.location
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return 'ws://localhost:4800/ws';
}

export function useWebSocket(onMessage: (event: MessageEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    try {
      const ws = new WebSocket(deriveWsUrl());
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
