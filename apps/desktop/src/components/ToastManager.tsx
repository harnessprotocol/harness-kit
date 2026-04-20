// apps/desktop/src/components/ToastManager.tsx
import { useEffect, useRef, useState } from "react";
import { useServiceHealth } from "../contexts/ServiceHealthContext";
import type { ServiceId, ServiceStatus } from "../contexts/ServiceHealthContext";

interface Toast {
  id: number;
  message: string;
  type: "warning" | "success";
}

let toastId = 0;

const LABELS: Record<ServiceId, string> = {
  board: "Board server",
  chat: "Chat relay",
  membrain: "Memory server",
  agent: "Agent server",
};

function toastMessage(id: ServiceId, from: ServiceStatus, to: ServiceStatus): Toast | null {
  // Don't fire toasts on initial startup (from "unknown")
  if (from === "unknown") return null;
  if (to === "down") return { id: toastId++, message: `${LABELS[id]} disconnected`, type: "warning" };
  if (to === "up" && from === "down") return { id: toastId++, message: `${LABELS[id]} reconnected`, type: "success" };
  return null;
}

export function ToastManager() {
  const { onTransition } = useServiceHealth();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    return onTransition((id, from, to) => {
      const toast = toastMessage(id, from, to);
      if (!toast) return;
      setToasts((prev) => [...prev.slice(-2), toast]); // max 3
      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        timersRef.current.delete(toast.id);
      }, 4000);
      timersRef.current.set(toast.id, timer);
    });
  }, [onTransition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { timersRef.current.forEach((t) => clearTimeout(t)); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 16,
      right: 16,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      zIndex: 9999,
      pointerEvents: "none",
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
            background: toast.type === "success" ? "var(--success)" : "var(--warning)",
            color: "#fff",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            animation: "toast-slide-in 200ms ease-out",
          }}
        >
          {toast.message}
        </div>
      ))}
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
