import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ToastViewport } from "@harness-kit/ui";
import type { ToastItem } from "@harness-kit/ui";

export type PushToast = (toast: Omit<ToastItem, "id">) => void;

/** How long a toast stays before it dismisses itself. */
export const TOAST_TIMEOUT_MS = 4000;

// The default is a no-op, not a throw: a page rendered outside AppLayout (a
// unit test, a dev fixture) still works and simply shows no toast.
const ToastContext = createContext<PushToast>(() => {});

/**
 * One toast stack for the app (design D15). Mounted once in AppLayout; pages
 * call `useToast()` rather than keeping their own toast state.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<PushToast>(
    (toast) => {
      nextId.current += 1;
      const id = `toast-${nextId.current}`;
      setToasts((current) => [...current, { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_TIMEOUT_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Push a toast onto the app's stack. A no-op outside a ToastProvider. */
export function useToast(): PushToast {
  return useContext(ToastContext);
}
