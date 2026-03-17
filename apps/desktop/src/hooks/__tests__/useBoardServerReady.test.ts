import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBoardServerReady } from '../useBoardServerReady';
import { BOARD_SERVER_BASE } from '../../lib/board-api';

const HEALTH_URL = `${BOARD_SERVER_BASE}/health`;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useBoardServerReady', () => {
  it('starts with ready=false', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useBoardServerReady());
    expect(result.current.ready).toBe(false);
    expect(result.current.timedOut).toBe(false);
  });

  it('sets ready=true when /health returns ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const { result } = renderHook(() => useBoardServerReady());

    await act(async () => { await Promise.resolve(); });

    expect(result.current.ready).toBe(true);
    expect(result.current.timedOut).toBe(false);
    expect(fetch).toHaveBeenCalledWith(HEALTH_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('does not set ready=true when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const { result } = renderHook(() => useBoardServerReady());

    await act(async () => { await Promise.resolve(); });

    expect(result.current.ready).toBe(false);
    expect(result.current.timedOut).toBe(false);
  });

  it('retries every 2 seconds until server is ready', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBoardServerReady());

    // First call (immediate)
    await act(async () => { await Promise.resolve(); });
    expect(result.current.ready).toBe(false);
    expect(result.current.timedOut).toBe(false);

    // After 2s
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve(); });
    expect(result.current.ready).toBe(false);
    expect(result.current.timedOut).toBe(false);

    // After another 2s — now ok
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve(); });
    expect(result.current.ready).toBe(true);
    expect(result.current.timedOut).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops polling after ready=true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBoardServerReady());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.ready).toBe(true);
    expect(result.current.timedOut).toBe(false);

    const callCount = fetchMock.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(10000); await Promise.resolve(); });
    expect(fetchMock.mock.calls.length).toBe(callCount); // no additional calls
  });

  it('clears the interval on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const { unmount } = renderHook(() => useBoardServerReady());
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('sets timedOut=true after 5 failed polls and stops polling', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('refused'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBoardServerReady());

    // Poll 1 (immediate)
    await act(async () => { await Promise.resolve(); });
    expect(result.current.timedOut).toBe(false);

    // Poll 2
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve(); });
    expect(result.current.timedOut).toBe(false);

    // Poll 3
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve(); });
    expect(result.current.timedOut).toBe(false);

    // Poll 4
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve(); });
    expect(result.current.timedOut).toBe(false);

    // Poll 5 — timedOut flips
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve(); });
    expect(result.current.timedOut).toBe(true);
    expect(result.current.ready).toBe(false);

    const callCount = fetchMock.mock.calls.length;
    // Polling should stop after timedOut
    await act(async () => { vi.advanceTimersByTime(10000); await Promise.resolve(); });
    expect(fetchMock.mock.calls.length).toBe(callCount);
  });
});
