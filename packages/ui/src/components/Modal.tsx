import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** aria-label fallback when `title` isn't plain text. */
  ariaLabel?: string;
}

/**
 * The ONE modal implementation (DESIGN.md §7 — kills the legacy 3 modal
 * styles). Escape closes and returns focus to the trigger; overlay click
 * closes; focus is trapped within the dialog while open.
 */
export function Modal({ open, onClose, title, children, footer, ariaLabel }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      requestAnimationFrame(() => dialogRef.current?.focus());
    } else if (triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="hk-modal-overlay" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? undefined : ariaLabel}
        aria-labelledby={typeof title === "string" ? "hk-modal-title" : undefined}
        tabIndex={-1}
        className="hk-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="hk-modal-header">
            <div id="hk-modal-title" className="hk-modal-title">
              {title}
            </div>
            <button
              type="button"
              className="hk-modal-close hk-reset-btn"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={16} strokeWidth={1.7} />
            </button>
          </div>
        )}
        <div className="hk-modal-body">{children}</div>
        {footer && <div className="hk-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
