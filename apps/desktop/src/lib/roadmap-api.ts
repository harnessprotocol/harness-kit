import { apiFetch } from './board-api';
import type {
  Roadmap,
  RoadmapFeature,
  CompetitorAnalysis,
  Competitor,
} from './roadmap-types';

export const roadmapApi = {
  roadmap: {
    get: (slug: string) =>
      apiFetch<Roadmap | null>(`/projects/${slug}/roadmap`),
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
      apiFetch<CompetitorAnalysis | null>(`/projects/${slug}/competitors`),
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
