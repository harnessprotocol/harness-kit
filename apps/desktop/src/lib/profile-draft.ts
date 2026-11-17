import { useSyncExternalStore } from "react";
import { errorDetails } from "./error-details";
import { saveProfileText } from "./profile-save";
import { setUnsavedDrafts } from "./tauri";
import { LEGACY_CLAUDE_PROFILE_DISPLAY, PERSONAL_PROFILE_DISPLAY } from "./legacy-harness-notice";

/**
 * Unsaved Profile editor text, kept outside the page so leaving Profile for
 * another sidebar page (which unmounts it) does not discard the edits.
 *
 * Keyed by file path. `buffer` is the editor text; `synced` is the disk text the
 * buffer was last in step with, which Save's conflict check is built from.
 * Mirrored to localStorage (one key) so a draft survives quitting the app; it
 * is read back when this module loads. Storage that throws costs persistence,
 * never editing.
 */
export interface ProfileDraft {
  buffer: string;
  synced: string;
}

const STORAGE_KEY = "harness-kit:drafts:v1";

function readStored(): Map<string, ProfileDraft> {
  const out = new Map<string, ProfileDraft>();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
    for (const [path, value] of Object.entries(raw)) {
      const d = value as Partial<ProfileDraft> | null;
      if (d && typeof d.buffer === "string" && typeof d.synced === "string") {
        out.set(path, { buffer: d.buffer, synced: d.synced });
      }
    }
  } catch {
    // No storage, or unreadable: start with no drafts.
  }
  return reconcileStored(out);
}

/**
 * Stored drafts that can no longer be restored are dropped, or they would show
 * the unsaved dot and prompt at every quit forever. The editor only ever
 * writes ~/.harness/harness.yaml, and a draft belongs under that path or under
 * the legacy ~/.claude/harness.yaml it was read from. Rule:
 *  - a key that is neither is dropped (the project baseline is read-only and
 *    never has a draft, so no other key is valid);
 *  - a legacy-key draft moves to the personal key, unless one is already
 *    there. The page then restores it against the current file, and Save's
 *    digest check refuses it if that file has moved on.
 */
function reconcileStored(stored: Map<string, ProfileDraft>): Map<string, ProfileDraft> {
  const out = new Map<string, ProfileDraft>();
  const personal = stored.get(PERSONAL_PROFILE_DISPLAY);
  const legacy = stored.get(LEGACY_CLAUDE_PROFILE_DISPLAY);
  const kept = personal ?? legacy;
  if (kept) out.set(PERSONAL_PROFILE_DISPLAY, kept);
  return out;
}

function pushUnsavedFlag(unsaved: boolean): void {
  try {
    void setUnsavedDrafts(unsaved).catch(() => {});
  } catch {
    // Outside Tauri there is no native side to tell.
  }
}

function writeStored(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(drafts)));
  } catch {
    // Storage full or blocked: the in-memory draft still works.
  }
}

const drafts = readStored();
const listeners = new Set<() => void>();
// useSyncExternalStore needs a snapshot that changes only when the answer does.
let hasDraft = drafts.size > 0;
// Rust decides a plain window close from this, so it is told at load and on every flip.
pushUnsavedFlag(hasDraft);

function notify(): void {
  const next = drafts.size > 0;
  if (next === hasDraft) return;
  hasDraft = next;
  pushUnsavedFlag(next);
  for (const listener of [...listeners]) listener();
}

export function getProfileDraft(path: string): ProfileDraft | undefined {
  return drafts.get(path);
}

export function setProfileDraft(path: string, draft: ProfileDraft): void {
  drafts.set(path, { buffer: draft.buffer, synced: draft.synced });
  writeStored();
  notify();
}

export function clearProfileDraft(path: string): void {
  drafts.delete(path);
  writeStored();
  notify();
}

/** Drops every draft. For tests. */
export function clearAllProfileDrafts(): void {
  drafts.clear();
  writeStored();
  notify();
}

/** Whether any draft holds unsaved edits. */
export function hasUnsavedDrafts(): boolean {
  return drafts.size > 0;
}

/** Paths of the drafts holding unsaved edits. */
export function unsavedDraftPaths(): string[] {
  return [...drafts.keys()];
}

export interface SaveAllResult {
  saved: string[];
  failed: { path: string; reason: string }[];
}

/**
 * Saves every draft through the Profile page's write path. A saved draft is
 * cleared; a failed one stays, with the reason, so nothing is lost.
 */
export async function saveAllDrafts(): Promise<SaveAllResult> {
  const result: SaveAllResult = { saved: [], failed: [] };
  for (const [path, draft] of [...drafts]) {
    try {
      await saveProfileText(path, draft.buffer, draft.synced);
      clearProfileDraft(path);
      result.saved.push(path);
    } catch (e) {
      result.failed.push({ path, reason: errorDetails(e) });
    }
  }
  return result;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while any Profile file has unsaved edits held in the store. */
export function useHasProfileDraft(): boolean {
  return useSyncExternalStore(subscribe, () => hasDraft, () => false);
}
