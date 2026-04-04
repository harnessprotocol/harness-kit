import { useState, useEffect, useCallback } from 'react';
import { roadmapApi } from '../lib/roadmap-api';
import type { Roadmap, CompetitorAnalysis } from '../lib/roadmap-types';
import { useWebSocket } from './useWebSocket';

type RoadmapEvent =
  | { type: 'roadmap_updated'; slug: string; roadmap: Roadmap }
  | { type: 'competitors_updated'; slug: string; competitorAnalysis: CompetitorAnalysis }
  | { type: 'connected'; message: string };

export function useRoadmapData(slug: string, ready = true) {
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [competitorAnalysis, setCompetitorAnalysis] = useState<CompetitorAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const fetchAll = useCallback(() => {
    Promise.all([
      roadmapApi.roadmap.get(slug),
      roadmapApi.competitors.get(slug),
    ])
      .then(([r, c]) => {
        setRoadmap(r);
        setCompetitorAnalysis(c);
        setError(null);
        setLastSyncedAt(new Date());
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    fetchAll();
  }, [ready, fetchAll]);

  useWebSocket((evt) => {
    try {
      const event = JSON.parse(evt.data as string) as RoadmapEvent;
      if (event.type === 'roadmap_updated' && event.slug === slug && event.roadmap) {
        setRoadmap(event.roadmap);
        setLastSyncedAt(new Date());
      } else if (event.type === 'competitors_updated' && event.slug === slug && event.competitorAnalysis) {
        setCompetitorAnalysis(event.competitorAnalysis);
        setLastSyncedAt(new Date());
      }
    } catch {
      // ignore malformed messages
    }
  });

  return { roadmap, competitorAnalysis, loading, error, refetch: fetchAll, lastSyncedAt };
}
