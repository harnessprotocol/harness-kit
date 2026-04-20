import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useBoardServerReady } from '../useBoardServerReady';
import { BOARD_SERVER_BASE } from '../../lib/board-api';
import { ServiceHealthProvider } from '../../contexts/ServiceHealthContext';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ServiceHealthProvider, null, children);

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
    const { result } = renderHook(() => useBoardServerReady(), { wrapper });
    expect(result.current.ready).toBe(false);
    expect(result.current.timedOut).toBe(false);
  });

  it('sets ready=true when /health returns ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const { result } = renderHook(() => useBoardServerReady(), { wrapper });

    await act(async () => { await Promise.resolve(); });

    expect(result.current.ready).toBe(true);
    expect(result.current.timedOut).toBe(false);
    expect(fetch).toHaveBeenCalledWith(HEALTH_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('does not set ready=true when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const { result } = renderHook(() => useBoardServerReady(), { wrapper });

    await act(async () => { await Promise.resolve(); });

    expect(result.current.ready).toBe(false);
    expect(result.current.timedOut).toBe(false);
  });

  it('retries with exponential backoff until server is ready', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBoardServerReady(), { wrapper });

    // Poll 1 (immediate)
    await act(async () => { await Promise.resolve(); });
    expect(result.current.ready).toBe(false);

    // Poll 2: onFailure called nextBackoffMs(2000)=4000, so poll2 fires after 4s
    await act(async () => { vi.advanceTimersByTime(4000); await Promise.resolve(); });
    expect(result.current.ready).toBe(false);

    // Poll 3: onFailure called nextBackoffMs(4000)=8000, so poll3 fires after 8s
    await act(async () => { vi.advanceTimersByTime(8000); await Promise.resolve(); });
    expect(result.current.ready).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops polling after ready=true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBoardServerReady(), { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.ready).toBe(true);

    const callCount = fetchMock.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(10000); await Promise.resolve(); });
    expect(fetchMock.mock.calls.length).toBe(callCount); // no additional calls
  });

  it('clears the timer on unmount', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const { unmount } = renderHook(() => useBoardServerReady(), { wrapper });
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  // With exponential backoff (2s→4s→8s→16s→30s), totalWaitMs hits 60s after 5 failures:
  // poll1→totalWaitMs=2s, poll2→6s, poll3→14s, poll4→30s, poll5→60s → timedOut
  it('sets timedOut=true after cumulative 60s of failures', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('refused'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBoardServerReady(), { wrapper });

    // Poll 1 (immediate): backoffMs=2000, totalWaitMs+=2000=2000, nextBackoffMs→4000, schedules 4s
    await act(async () => { await Promise.resolve(); });
    expect(result.current.timedOut).toBe(false);

    // Poll 2 (after 4s): backoffMs=4000, totalWaitMs+=4000=6000, nextBackoffMs→8000, schedules 8s
    await act(async () => { vi.advanceTimersByTime(4000); await Promise.resolve(); });
    expect(result.current.timedOut).toBe(false);

    // Poll 3 (after 8s): backoffMs=8000, totalWaitMs+=8000=14000, nextBackoffMs→16000, schedules 16s
    await act(async () => { vi.advanceTimersByTime(8000); await Promise.resolve(); });
    expect(result.current.timedOut).toBe(false);

    // Poll 4 (after 16s): backoffMs=16000, totalWaitMs+=16000=30000, nextBackoffMs→30000, schedules 30s
    await act(async () => { vi.advanceTimersByTime(16000); await Promise.resolve(); });
    expect(result.current.timedOut).toBe(false);

    // Poll 5 (after 30s): backoffMs=30000, totalWaitMs+=30000=60000 → timedOut=true, heartbeat
    await act(async () => { vi.advanceTimersByTime(30000); await Promise.resolve(); });
    expect(result.current.timedOut).toBe(true);
    expect(result.current.ready).toBe(false);

    // Heartbeat is 30s — advancing 10s should produce no new calls
    const callCount = fetchMock.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(10000); await Promise.resolve(); });
    expect(fetchMock.mock.calls.length).toBe(callCount);
  });
});
