import { useMemo, useSyncExternalStore } from "react";
import { grantProjectScope } from "./tauri";

/**
 * The one project directory the desktop app tracks (spec AC-17, design D9).
 * The title bar's selector writes it; Machine, Drift, Profile › Compile,
 * Activity and Onboarding read it. There is no multi-project registry (see
 * DESIGN.md Fleet contract: scope honestly to Global + the open project).
 *
 * Storage, both keys read defensively (storage can throw or come back empty):
 * - `harness-kit-sync-recent-dirs`: recently chosen directories, most recent
 *   first. Choosing a project moves it to the front.
 * - `harness-kit-current-project`: the current project, or "" once the user
 *   clears it. Absent on installs that predate the selector, where the
 *   current project was the head of the recent list; that stays the fallback,
 *   so the last project is restored at launch.
 *
 * Every write dispatches `harness-kit-project-changed` on window.
 */
const RECENT_DIRS_KEY = "harness-kit-sync-recent-dirs";
const CURRENT_KEY = "harness-kit-current-project";
const MAX_RECENT = 10;

export const PROJECT_CHANGED_EVENT = "harness-kit-project-changed";

/** Set only when a write to storage failed, so the session still sees the choice. */
let unsaved: { dir: string | null } | null = null;

export function getRecentProjectDirs(): string[] {
  try {
    const dirs = JSON.parse(localStorage.getItem(RECENT_DIRS_KEY) ?? "[]");
    return Array.isArray(dirs) ? dirs.filter((dir): dir is string => typeof dir === "string" && dir !== "") : [];
  } catch {
    return [];
  }
}

export function getCurrentProjectDir(): string | null {
  if (unsaved) return unsaved.dir;
  try {
    const current = localStorage.getItem(CURRENT_KEY);
    if (current !== null) return current || null;
  } catch {
    return null;
  }
  return getRecentProjectDirs()[0] ?? null;
}

/**
 * Make `dir` the current project (null clears it; the recent list is kept),
 * then ask Tauri for access to it: choosing a project is the user asking.
 */
export function setCurrentProjectDir(dir: string | null): void {
  const next = dir?.trim() ? dir.trim() : null;
  try {
    if (next) {
      const recent = [next, ...getRecentProjectDirs().filter((d) => d !== next)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(recent));
    }
    localStorage.setItem(CURRENT_KEY, next ?? "");
    unsaved = null;
  } catch {
    unsaved = { dir: next };
  }
  if (next) void grantProjectDir(next);
  window.dispatchEvent(new Event(PROJECT_CHANGED_EVENT));
}

/**
 * Grant the webview (and the sync bridge) access to `dir` for this session.
 * Resolves false instead of rejecting: a stale or refused directory drops the
 * project from a scan rather than failing it. Idempotent on the Rust side, so
 * every reader calls it before touching the project.
 */
export function grantProjectDir(dir: string): Promise<boolean> {
  return grantProjectScope(dir).then(
    () => true,
    () => false,
  );
}

/** Open the native folder picker and make the pick the current project. */
export async function chooseProjectDir(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, title: "Select project directory" });
    if (selected && typeof selected === "string") {
      setCurrentProjectDir(selected);
      return selected;
    }
  } catch {
    // Dialog unavailable (outside Tauri): nothing changes.
  }
  return null;
}

export function projectDirLabel(dir: string): string {
  const parts = dir.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || dir;
}

function subscribe(onChange: () => void): () => void {
  // `storage` covers another window of the app changing it.
  window.addEventListener(PROJECT_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PROJECT_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The current project and its setter; re-renders when anything changes it. */
export function useProjectDir(): [string | null, (dir: string | null) => void] {
  const dir = useSyncExternalStore(subscribe, getCurrentProjectDir);
  return [dir, setCurrentProjectDir];
}

/** The recent list, most recent first; re-renders with the current project. */
export function useRecentProjectDirs(): string[] {
  const serialized = useSyncExternalStore(subscribe, () => JSON.stringify(getRecentProjectDirs()));
  return useMemo(() => JSON.parse(serialized) as string[], [serialized]);
}
