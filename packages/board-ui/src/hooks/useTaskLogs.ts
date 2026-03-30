import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { getBoardApiBase } from '../lib/api';

function deriveWsUrl(): string {
  const base = getBoardApiBase();
  if (base.startsWith('http')) {
    const url = new URL(base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    return url.toString();
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return 'ws://localhost:4800/ws';
}

interface UseTaskLogsOptions {
  slug: string;
  taskId: number | null;
  maxLines?: number;
  enabled?: boolean;
}

export function useTaskLogs({ slug, taskId, maxLines = 1000, enabled = true }: UseTaskLogsOptions) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Load initial logs via HTTP
  useEffect(() => {
    if (!taskId || !enabled) { setLines([]); return; }
    setLoading(true);
    api.logs.tail(slug, taskId, 200)
      .then(initial => setLines(initial))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, taskId, enabled]);

  // Subscribe to live log streaming via WebSocket
  useEffect(() => {
    if (!taskId || !enabled) return;

    const ws = new WebSocket(deriveWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe_logs', task_id: taskId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'task_log_line' && msg.task_id === taskId && msg.slug === slug) {
          setLines(prev => {
            const updated = [...prev, msg.line];
            return updated.slice(-maxLines);
          });
        }
      } catch { /* ignore */ }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe_logs', task_id: taskId }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, [slug, taskId, enabled, maxLines]);

  function clearLogs() {
    setLines([]);
  }

  return { lines, loading, clearLogs };
}
