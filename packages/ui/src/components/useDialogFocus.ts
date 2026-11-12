import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, oldest first. Only the top one traps Tab, so a dialog opened
// from another (a confirm over a form) does not fight its parent.
const openDialogs: RefObject<HTMLElement | null>[] = [];

/**
 * Focus management shared by every modal dialog (AC-61): focus moves into the
 * dialog when it opens, Tab wraps inside it, and focus returns to whatever
 * had it before — on close and on unmount. The dialog element needs
 * `tabIndex={-1}` so it can take focus itself.
 */
export function useDialogFocus(open: boolean, dialogRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement;
    openDialogs.push(dialogRef);
    const raf = requestAnimationFrame(() => dialogRef.current?.focus());

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || openDialogs[openDialogs.length - 1] !== dialogRef) return;
      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        e.preventDefault();
        root.focus();
      } else if (!root.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      const i = openDialogs.lastIndexOf(dialogRef);
      if (i !== -1) openDialogs.splice(i, 1);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [open, dialogRef]);
}
