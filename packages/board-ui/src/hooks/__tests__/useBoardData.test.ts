import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock useWebSocket before importing the hook under test
vi.mock('../useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      projects: {
        ...actual.api.projects,
        get: vi.fn(),
      },
    },
  };
});

import { useBoardData } from '../useBoardData';
import { api } from '../../lib/api';

const mockProject = {
  name: 'Test Project',
  slug: 'test-project',
  description: 'A test project',
  next_id: 1,
  version: 2 as const,
  epics: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('useBoardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.projects.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockProject);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls api.projects.get on mount when ready=true', async () => {
    renderHook(() => useBoardData('test-project', true));

    await waitFor(() => {
      expect(api.projects.get).toHaveBeenCalledWith('test-project');
    });
  });

  it('does NOT call api when ready=false', () => {
    renderHook(() => useBoardData('test-project', false));
    expect(api.projects.get).not.toHaveBeenCalled();
  });

  it('sets loading=true initially, then false after fetch', async () => {
    let resolvePromise: (v: typeof mockProject) => void;
    (api.projects.get as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(resolve => { resolvePromise = resolve; }),
    );

    const { result } = renderHook(() => useBoardData('test-project', true));

    // Should be loading immediately after the effect fires
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!(mockProject);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('sets error on API failure', async () => {
    (api.projects.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error'),
    );

    const { result } = renderHook(() => useBoardData('test-project', true));

    await waitFor(() => {
      expect(result.current.error).toContain('Network error');
    });
  });

  it('exposes refetch function', async () => {
    const { result } = renderHook(() => useBoardData('test-project', true));

    await waitFor(() => {
      expect(result.current.project).toEqual(mockProject);
    });

    // Clear and refetch
    (api.projects.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockProject,
      name: 'Updated',
    });

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.project?.name).toBe('Updated');
    });
  });
});
