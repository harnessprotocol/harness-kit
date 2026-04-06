import { apiFetch, BOARD_SERVER_BASE } from './board-api';
import type {
  Roadmap,
  RoadmapFeature,
  CompetitorAnalysis,
  Competitor,
} from './roadmap-types';

/** Fetch that returns null on 404 instead of throwing. */
async function apiFetchOrNull<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BOARD_SERVER_BASE}/api/v1${path}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

export type GenerationPhase = 'analyzing' | 'generating' | 'saving' | 'done';

export interface GenerationEvent {
  type: 'phase' | 'done' | 'error';
  phase?: GenerationPhase;
  label?: string;
  message?: string;
}

export function streamRoadmapGeneration(
  slug: string,
  onEvent: (event: GenerationEvent) => void,
): () => void {
  // EventSource only supports GET — use fetch with manual SSE parsing for POST
  const url = `${BOARD_SERVER_BASE}/api/v1/projects/${slug}/roadmap/generate`;
  let aborted = false;

  const controller = new AbortController();
  const { signal } = controller;

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
        signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => res.statusText);
        onEvent({ type: 'error', message: `Server error ${res.status}: ${text}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          const lines = block.split('\n');
          let eventType = '';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            else if (line.startsWith('data: ')) data = line.slice(6).trim();
          }
          if (!eventType || !data) continue;
          try {
            const parsed = JSON.parse(data) as Record<string, string>;
            onEvent({ type: eventType as 'phase' | 'done' | 'error', ...parsed });
          } catch {
            // ignore malformed frames
          }
        }
      }
    } catch (err) {
      if (!aborted) {
        onEvent({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    }
  })();

  return () => {
    aborted = true;
    controller.abort();
  };
}

export const roadmapApi = {
  roadmap: {
    get: (slug: string) =>
      apiFetchOrNull<Roadmap>(`/projects/${slug}/roadmap`),
    save: (slug: string, roadmap: Roadmap) =>
      apiFetch<Roadmap>(`/projects/${slug}/roadmap`, {
        method: 'PUT',
        body: JSON.stringify(roadmap),
      }),
  },
  features: {
    list: (slug: string, filters?: { status?: string; priority?: string }) => {
      const q = new URLSearchParams();
      if (filters?.status) q.set('status', filters.status);
      if (filters?.priority) q.set('priority', filters.priority);
      return apiFetch<RoadmapFeature[]>(
        `/projects/${slug}/roadmap/features${q.size ? `?${q}` : ''}`
      );
    },
    add: (slug: string, feature: Omit<RoadmapFeature, 'id'>) =>
      apiFetch<RoadmapFeature>(`/projects/${slug}/roadmap/features`, {
        method: 'POST',
        body: JSON.stringify(feature),
      }),
    update: (slug: string, featureId: string, updates: Partial<RoadmapFeature>) =>
      apiFetch<RoadmapFeature>(`/projects/${slug}/roadmap/features/${featureId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    remove: (slug: string, featureId: string) =>
      apiFetch<void>(`/projects/${slug}/roadmap/features/${featureId}`, {
        method: 'DELETE',
      }),
    convertToTask: (slug: string, featureId: string, epicId: number) =>
      apiFetch<{ task: unknown; feature: RoadmapFeature }>(
        `/projects/${slug}/roadmap/features/${featureId}/convert`,
        {
          method: 'POST',
          body: JSON.stringify({ epic_id: epicId }),
        }
      ),
  },
  competitors: {
    get: (slug: string) =>
      apiFetchOrNull<CompetitorAnalysis>(`/projects/${slug}/competitors`),
    save: (slug: string, analysis: CompetitorAnalysis) =>
      apiFetch<CompetitorAnalysis>(`/projects/${slug}/competitors`, {
        method: 'PUT',
        body: JSON.stringify(analysis),
      }),
    add: (slug: string, competitor: Omit<Competitor, 'id'>) =>
      apiFetch<CompetitorAnalysis>(`/projects/${slug}/competitors`, {
        method: 'POST',
        body: JSON.stringify(competitor),
      }),
  },
};
