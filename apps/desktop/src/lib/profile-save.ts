import { writeHarnessFile } from "./tauri";
import { loadedDigest } from "./loaded-digest";
import { PERSONAL_PROFILE_DISPLAY } from "./legacy-harness-notice";

/**
 * Writes Profile text to the personal harness.yaml (AC-50). The digest is of
 * the text the buffer was last in step with (`synced`), so the write is refused
 * if the file changed since. Only a file read from ~/.harness/harness.yaml has
 * a digest to send; the ~/.claude/harness.yaml fallback is read-only and its
 * save creates the new file, which must not exist yet (AC-55).
 *
 * Shared by the Profile page's Save and the quit prompt's Save all.
 */
export async function saveProfileText(
  loadedPath: string | null,
  content: string,
  synced: string | null | undefined,
): Promise<string> {
  const expected = loadedPath === PERSONAL_PROFILE_DISPLAY ? await loadedDigest(synced) : undefined;
  return writeHarnessFile(content, expected);
}
