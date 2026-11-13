import { useSyncExternalStore } from "react";

/**
 * Unsaved Profile editor text, kept outside the page so leaving Profile for
 * another sidebar page (which unmounts it) does not discard the edits.
 *
 * Keyed by file path. `buffer` is the editor text; `synced` is the disk text the
 * buffer was last in step with, which Save's conflict check is built from.
 * Memory only: a draft lasts as long as the app window, not across restarts.
 */
export interface ProfileDraft {
  buffer: string;
  synced: string;
}

const drafts = new Map<string, ProfileDraft>();
const listeners = new Set<() => void>();
// useSyncExternalStore needs a snapshot that changes only when the answer does.
let hasDraft = false;

function notify(): void {
  const next = drafts.size > 0;
  if (next === hasDraft) return;
  hasDraft = next;
  for (const listener of [...listeners]) listener();
}

export function getProfileDraft(path: string): ProfileDraft | undefined {
  return drafts.get(path);
}

export function setProfileDraft(path: string, draft: ProfileDraft): void {
  drafts.set(path, { buffer: draft.buffer, synced: draft.synced });
  notify();
}

export function clearProfileDraft(path: string): void {
  drafts.delete(path);
  notify();
}

/** Drops every draft. For tests. */
export function clearAllProfileDrafts(): void {
  drafts.clear();
  notify();
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
