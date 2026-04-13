import { useCallback, useEffect, useState } from "react";
import type { Project } from "../lib/board-api";
import { api } from "../lib/board-api";
import { useWebSocket } from "./useWebSocket";

type BoardEvent =
  | { type: "project_updated"; slug: string; project: Project }
  | { type: "connected"; message: string };

export function useBoardData(slug: string, ready = true) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const fetchProject = useCallback(() => {
    api.projects
      .get(slug)
      .then((p) => {
        setProject(p);
        setError(null);
        setLastSyncedAt(new Date());
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    fetchProject();
  }, [ready, fetchProject]);

  useWebSocket((evt) => {
    try {
      const event = JSON.parse(evt.data as string) as BoardEvent;
      if (event.type === "project_updated" && event.slug === slug && event.project) {
        setProject(event.project);
        setLastSyncedAt(new Date());
      }
    } catch {
      // ignore malformed messages
    }
  });

  return { project, loading, error, refetch: fetchProject, lastSyncedAt };
}
