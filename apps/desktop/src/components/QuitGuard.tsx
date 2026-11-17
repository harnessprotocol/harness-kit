import { useCallback, useEffect, useState } from "react";
import { Button, Modal } from "@harness-kit/ui";
import { clearProfileDraft, hasUnsavedDrafts, saveAllDrafts, unsavedDraftPaths } from "../lib/profile-draft";
import { QUIT_REQUESTED_EVENT } from "../lib/app-menu";
import { confirmQuit, isTauriRuntimeAvailable } from "../lib/tauri";

/**
 * Answers the native quit request (⌘Q, the Quit menu item, closing the window).
 * With no unsaved drafts the app quits at once; otherwise a dialog asks first.
 * Mounted at the App root so the request is always heard.
 */
export function QuitGuard() {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [failures, setFailures] = useState<{ path: string; reason: string }[]>([]);

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen(QUIT_REQUESTED_EVENT, () => {
          if (!hasUnsavedDrafts()) {
            void confirmQuit();
            return;
          }
          setFailures([]);
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
        await confirmQuit();
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
    void confirmQuit();
  }

  if (paths === null) return null;
  const count = paths.length;

  return (
    <Modal
      open
      onClose={cancel}
      title="Save changes before quitting?"
      footer={
        <>
          <Button variant="primary" onClick={() => void saveAll()} disabled={saving} autoFocus>Save all</Button>
          <Button onClick={discard} disabled={saving}>Discard</Button>
          <Button onClick={cancel} disabled={saving}>Cancel</Button>
        </>
      }
    >
      <p>You have unsaved changes in {count} {count === 1 ? "file" : "files"}.</p>
      <ul>
        {paths.map((p) => (
          <li key={p}><code>{p}</code></li>
        ))}
      </ul>
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
