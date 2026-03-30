import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureBoardApi, getBoardApiBase, apiFetch, api } from '../api';

function mockFetch(body: unknown = {}, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    statusText: 'Error',
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('api module', () => {
  beforeEach(() => {
    configureBoardApi('/api/v1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('configureBoardApi / getBoardApiBase', () => {
    it('returns default base URL', () => {
      expect(getBoardApiBase()).toBe('/api/v1');
    });

    it('changes the base URL used by apiFetch', () => {
      configureBoardApi('http://localhost:4800/api/v1');
      expect(getBoardApiBase()).toBe('http://localhost:4800/api/v1');
    });
  });

  describe('apiFetch', () => {
    it('calls fetch with the correct full URL', async () => {
      const fetchMock = mockFetch({ ok: true });
      await apiFetch('/projects');
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/projects',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
    });

    it('throws on non-200 response', async () => {
      mockFetch('Not found', 404);
      await expect(apiFetch('/missing')).rejects.toThrow('API 404');
    });

    it('uses configured base URL', async () => {
      configureBoardApi('http://example.com/api/v1');
      const fetchMock = mockFetch({});
      await apiFetch('/projects');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://example.com/api/v1/projects',
        expect.anything(),
      );
    });
  });

  describe('api.tasks.create', () => {
    it('builds correct URL with project slug and epic ID', async () => {
      const fetchMock = mockFetch({ id: 1, title: 'Test' });
      await api.tasks.create('my-project', 5, {
        title: 'New Task',
        description: 'A description',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/projects/my-project/epics/5/tasks',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('api.subtasks.create', () => {
    it('builds correct URL', async () => {
      const fetchMock = mockFetch({ id: 1, title: 'Sub' });
      await api.subtasks.create('my-project', 10, { title: 'New Subtask' });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/projects/my-project/tasks/10/subtasks',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('api.execution.start', () => {
    it('builds correct URL', async () => {
      const fetchMock = mockFetch({ ok: true });
      await api.execution.start('my-project', 7);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/projects/my-project/tasks/7/execute',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('api.logs.tail', () => {
    it('builds correct URL with tail query param', async () => {
      const fetchMock = mockFetch({ lines: ['line1', 'line2'] });
      const result = await api.logs.tail('my-project', 3, 50);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/projects/my-project/tasks/3/logs?tail=50',
        expect.anything(),
      );
      expect(result).toEqual(['line1', 'line2']);
    });

    it('defaults to 100 lines', async () => {
      const fetchMock = mockFetch({ lines: [] });
      await api.logs.tail('my-project', 3);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/projects/my-project/tasks/3/logs?tail=100',
        expect.anything(),
      );
    });
  });
});
