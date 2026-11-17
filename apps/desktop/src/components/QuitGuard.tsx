import { useCallback, useEffect, useState } from "react";
import { Button, Modal } from "@harness-kit/ui";
import { clearProfileDraft, hasUnsavedDrafts, saveAllDrafts, unsavedDraftPaths } from "../lib/profile-draft";
import { QUIT_REQUESTED_EVENT } from "../lib/app-menu";
import { confirmQuit, isTauriRuntimeAvailable, quitRequestSeen } from "../lib/tauri";
import { errorDetails } from "../lib/error-details";

/**
 * Answers the native quit request (⌘Q, the Quit menu item, closing the window).
 * With no unsaved drafts the app quits at once; otherwise a dialog asks first.
 * Mounted at the App root so the request is always heard.
 */
export function QuitGuard() {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [failures, setFailures] = useState<{ path: string; reason: string }[]>([]);
  const [quitError, setQuitError] = useState<string | null>(null);

  // Exits the app; if that is refused the dialog says why instead of hanging.
  async function quit() {
    try {
      await confirmQuit();
    } catch (e) {
      setQuitError(errorDetails(e));
      setPaths((p) => p ?? unsavedDraftPaths());
    }
  }

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen(QUIT_REQUESTED_EVENT, () => {
          // Without this Rust force-quits after a short wait.
          void quitRequestSeen().catch(() => {});
          if (!hasUnsavedDrafts()) {
            void quit();
            return;
          }
          setFailures([]);
          setQuitError(null);
          setPaths(unsavedDraftPaths());
        }),
      )
      .then((off) => {
        if (disposed) off();
        else unlisten = off;
      })
      .catch(() => {
        // No event bridge (outside Tauri): there is no native quit to answer.
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const cancel = useCallback(() => {
    if (!saving) setPaths(null);
  }, [saving]);

  async function saveAll() {
    setSaving(true);
    setFailures([]);
    try {
      const { failed } = await saveAllDrafts();
      if (failed.length === 0) {
        await quit();
        return;
      }
      setFailures(failed);
      setPaths(unsavedDraftPaths());
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    for (const path of unsavedDraftPaths()) clearProfileDraft(path);
    void quit();
  }

  // Return is Save all. useDialogFocus moves focus into the dialog, so a
  // button's autoFocus cannot be relied on to make it the default.
  const open = paths !== null;
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.repeat || saving) return;
      e.preventDefault();
      void saveAll();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  if (paths === null) return null;
  const count = paths.length;

  return (
    <Modal
      open
      onClose={cancel}
      title="Save changes before quitting?"
      footer={
        <>
          <Button onClick={discard} disabled={saving} style={{ marginRight: "auto" }}>Don't Save</Button>
          <Button onClick={cancel} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void saveAll()} disabled={saving}>Save All</Button>
        </>
      }
    >
      <p>You have unsaved changes in {count} {count === 1 ? "file" : "files"}.</p>
      <ul>
        {paths.map((p) => (
          <li key={p}><code>{p}</code></li>
        ))}
      </ul>
      {quitError && <div role="alert"><p>Could not quit: {quitError}</p></div>}
      {failures.length > 0 && (
        <div role="alert">
          {failures.map((f) => (
            <p key={f.path}>Could not save {f.path}: {f.reason}</p>
          ))}
        </div>
      )}
    </Modal>
  );
}
