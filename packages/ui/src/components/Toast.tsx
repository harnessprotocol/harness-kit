import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import type { ReactNode } from "react";

export type ToastVariant = "success" | "warning" | "danger" | "info";

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  variant?: ToastVariant;
}

export interface ToastProps {
  toast: ToastItem;
  onDismiss?: (id: string) => void;
}

const ICON: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 size={16} strokeWidth={1.7} />,
  warning: <AlertTriangle size={16} strokeWidth={1.7} />,
  danger: <XCircle size={16} strokeWidth={1.7} />,
  info: <Info size={16} strokeWidth={1.7} />,
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const variant = toast.variant ?? "info";
  return (
    <div className="hk-toast" data-variant={variant} role={variant === "danger" ? "alert" : "status"}>
      <span className="hk-toast-icon" aria-hidden="true">
        {ICON[variant]}
      </span>
      <div>
        <div className="hk-toast-title">{toast.title}</div>
        {toast.message && <div className="hk-toast-message">{toast.message}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="hk-reset-btn"
          style={{ marginLeft: "auto" }}
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
        >
          <XCircle size={14} strokeWidth={1.7} color="var(--fg-subtle)" />
        </button>
      )}
    </div>
  );
}

export interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss?: (id: string) => void;
}

/** Fixed bottom-right stack. Mount once at the app root. */
export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="hk-toast-viewport">
      {toasts.slice(0, 3).map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
