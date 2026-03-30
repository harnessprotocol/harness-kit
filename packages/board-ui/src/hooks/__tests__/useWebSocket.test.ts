import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { configureBoardApi } from '../../lib/api';
import { useWebSocket } from '../useWebSocket';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onmessage: ((evt: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1; // OPEN

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
  }

  send() {}
}

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('derives ws:// URL from http:// base URL', () => {
    configureBoardApi('http://localhost:4800/api/v1');
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:4800/ws');
    unmount();
  });

  it('derives wss:// URL from https:// base URL', () => {
    configureBoardApi('https://example.com/api/v1');
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    expect(MockWebSocket.instances[0].url).toBe('wss://example.com/ws');
    unmount();
  });

  it('derives WS URL from window.location for relative base URL', () => {
    configureBoardApi('/api/v1');
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    // jsdom uses window.location.host which includes the port
    const expectedUrl = `ws://${window.location.host}/ws`;
    expect(MockWebSocket.instances[0].url).toBe(expectedUrl);
    unmount();
  });

  it('forwards messages to the onMessage callback', () => {
    configureBoardApi('http://localhost:4800/api/v1');
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    const ws = MockWebSocket.instances[0];
    const fakeEvent = new MessageEvent('message', { data: '{"type":"test"}' });
    ws.onmessage?.(fakeEvent);

    expect(onMessage).toHaveBeenCalledWith(fakeEvent);
    unmount();
  });

  it('cleans up WebSocket on unmount', () => {
    configureBoardApi('http://localhost:4800/api/v1');
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    const ws = MockWebSocket.instances[0];
    unmount();
    expect(ws.readyState).toBe(3); // CLOSED
  });
});
