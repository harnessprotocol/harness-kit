import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ServiceId = "board" | "chat" | "membrain" | "agent";
export type ServiceStatus = "unknown" | "starting" | "up" | "down";
export type AggregateStatus = "all-up" | "degraded" | "all-down";

export interface ServiceHealth {
  id: ServiceId;
  label: string;
  status: ServiceStatus;
  lastUp: number | null;
  error: string | null;
}

export interface ServiceHealthContextValue {
  services: ServiceHealth[];
  aggregate: AggregateStatus;
  report: (id: ServiceId, status: ServiceStatus, error?: string) => void;
  onTransition: (cb: TransitionCallback) => () => void;
}

export type TransitionCallback = (id: ServiceId, from: ServiceStatus, to: ServiceStatus) => void;

const INITIAL: ServiceHealth[] = [
  { id: "board",    label: "Board & Roadmap", status: "unknown", lastUp: null, error: null },
  { id: "chat",     label: "Chat Relay",      status: "unknown", lastUp: null, error: null },
  { id: "membrain", label: "Memory",          status: "unknown", lastUp: null, error: null },
  { id: "agent",    label: "Agent Server",    status: "unknown", lastUp: null, error: null },
];

function computeAggregate(services: ServiceHealth[]): AggregateStatus {
  const started = services.filter((s) => s.status !== "unknown");
  if (started.length === 0) return "all-up";
  const allUp = started.every((s) => s.status === "up");
  if (allUp) return "all-up";
  // "all-down" only when multiple services are started and every one is down
  const allDown = started.length > 1 && started.every((s) => s.status === "down");
  if (allDown) return "all-down";
  return "degraded";
}

const ServiceHealthContext = createContext<ServiceHealthContextValue | null>(null);

export function ServiceHealthProvider({ children }: { children: React.ReactNode }) {
  const [services, setServices] = useState<ServiceHealth[]>(INITIAL);
  const listenersRef = useRef<Set<TransitionCallback>>(new Set());

  const report = useCallback((id: ServiceId, status: ServiceStatus, error?: string) => {
    setServices((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const old = prev[idx];
      if (old.status === status) return prev;
      // Fire transition callbacks
      listenersRef.current.forEach((cb) => cb(id, old.status, status));
      const updated = [...prev];
      updated[idx] = {
        ...old,
        status,
        lastUp: status === "up" ? Date.now() : old.lastUp,
        error: error ?? null,
      };
      return updated;
    });
  }, []);

  const onTransition = useCallback((cb: TransitionCallback) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  const aggregate = computeAggregate(services);

  return (
    <ServiceHealthContext.Provider value={{ services, aggregate, report, onTransition }}>
      {children}
    </ServiceHealthContext.Provider>
  );
}

export function useServiceHealth(): ServiceHealthContextValue {
  const ctx = useContext(ServiceHealthContext);
  if (!ctx) throw new Error("useServiceHealth must be used within ServiceHealthProvider");
  return ctx;
}
