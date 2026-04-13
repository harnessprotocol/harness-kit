import { useCallback, useEffect, useState } from "react";
import { roadmapApi } from "../lib/roadmap-api";
import type { CompetitorAnalysis, Roadmap } from "../lib/roadmap-types";
import { useWebSocket } from "./useWebSocket";

type RoadmapEvent =
  | { type: "roadmap_updated"; slug: string }
  | { type: "competitors_updated"; slug: string }
  | { type: "connected"; message: string };

export function useRoadmapData(slug: string, ready = true) {
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [competitorAnalysis, setCompetitorAnalysis] = useState<CompetitorAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const fetchAll = useCallback(() => {
    Promise.all([roadmapApi.roadmap.get(slug), roadmapApi.competitors.get(slug)])
      .then(([r, c]) => {
        setRoadmap(r);
        setCompetitorAnalysis(c);
        setError(null);
        setLastSyncedAt(new Date());
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    fetchAll();
  }, [ready, fetchAll]);

  useWebSocket((evt) => {
    try {
      const msg = JSON.parse(evt.data as string) as RoadmapEvent;
      if (msg.type === "roadmap_updated" && msg.slug === slug) {
        fetchAll();
      }
      if (msg.type === "competitors_updated" && msg.slug === slug) {
        fetchAll();
      }
    } catch {
      // ignore malformed messages
    }
  });

  return { roadmap, competitorAnalysis, loading, error, refetch: fetchAll, lastSyncedAt };
}
