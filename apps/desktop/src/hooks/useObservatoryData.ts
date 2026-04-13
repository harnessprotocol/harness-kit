import type { LiveDailyActivity, LiveStats, StatsCache } from "@harness-kit/shared";
import type { ReactNode } from "react";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { computeLiveStats, readLiveActivity, readStatsCache } from "../lib/tauri";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MIN_REFETCH_MS = 60 * 1000; // skip poll if fetched within 60s

export interface ObservatoryData {
  cache: StatsCache | null;
  liveActivity: LiveDailyActivity[];
  liveStats: LiveStats | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastRefreshed: Date | null;
  refresh: () => void;
}

const INITIAL: ObservatoryData = {
  cache: null,
  liveActivity: [],
  liveStats: null,
  loading: true,
  isRefreshing: false,
  error: null,
  lastRefreshed: null,
  refresh: () => {},
};

const ObservatoryContext = createContext<ObservatoryData>(INITIAL);

/** Wrap near the app root so data fetching starts immediately on launch. */
export function ObservatoryProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<StatsCache | null>(null);
  const [liveActivity, setLiveActivity] = useState<LiveDailyActivity[]>([]);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const lastFetchTime = useRef<number>(0);

  const fetchAll = useCallback(async (isInitial: boolean) => {
    if (isInitial) setLoading(true);
    else setIsRefreshing(true);

    try {
      const [cacheResult, activityResult, statsResult] = await Promise.allSettled([
        readStatsCache(),
        readLiveActivity(),
        computeLiveStats(),
      ]);

      if (cacheResult.status === "fulfilled") setCache(cacheResult.value);
      if (activityResult.status === "fulfilled") setLiveActivity(activityResult.value);
      if (statsResult.status === "fulfilled") setLiveStats(statsResult.value);

      // Only set error if all three fail
      const allFailed =
        cacheResult.status === "rejected" &&
        activityResult.status === "rejected" &&
        statsResult.status === "rejected";
      if (allFailed) {
        setError(String((cacheResult as PromiseRejectedResult).reason));
      } else {
        setError(null);
      }

      lastFetchTime.current = Date.now();
      setLastRefreshed(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      if (isInitial) setLoading(false);
      else setIsRefreshing(false);
    }
  }, []);

  const refresh = useCallback(() => {
    fetchAll(false);
  }, [fetchAll]);

  // Fetch immediately on mount (app launch)
  useEffect(() => {
    fetchAll(true);
  }, [fetchAll]);

  // Poll every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastFetchTime.current < MIN_REFETCH_MS) return;
      fetchAll(false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const value: ObservatoryData = {
    cache,
    liveActivity,
    liveStats,
    loading,
    isRefreshing,
    error,
    lastRefreshed,
    refresh,
  };

  return createElement(ObservatoryContext.Provider, { value }, children);
}

/** Consume preloaded Observatory data. Must be inside ObservatoryProvider. */
export function useObservatoryData(): ObservatoryData {
  return useContext(ObservatoryContext);
}
