import { useMemo, useSyncExternalStore } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { grantProjectScope } from "./tauri";

/**
 * The one project directory the desktop app tracks (spec AC-17, design D9).
 * The title bar's selector writes it; Machine, Drift and Profile › Compile
 * subscribe, Onboarding and Settings › Activity read it once. There is no
 * multi-project registry (see DESIGN.md Fleet contract: scope honestly to
 * Global + the open project).
 *
 * Access: reading the value grants nothing. Every consumer calls
 * `grantProjectDir` before it touches the project (the grant is idempotent on
 * the Rust side), so a project restored at launch works on whichever page
 * reads it first. `setCurrentProjectDir` also grants on selection.
 *
 * Storage, both keys read defensively (storage can throw or come back empty):
 * - `harness-kit-sync-recent-dirs`: recently chosen directories, most recent
 *   first. Choosing a project moves it to the front.
 * - `harness-kit-current-project`: the current project, or "" once the user
 *   clears it. Absent on installs that predate the selector, where the
 *   current project was the head of the recent list; that stays the fallback,
 *   so the last project is restored at launch.
 *
 * Paths are absolute. Older builds saved `~/...` entries, which plugin-fs
 * takes literally; the getters hide them while `expandStoredTildes` rewrites
 * them against the home directory, and drop any it cannot expand.
 *
 * Every write dispatches `harness-kit-project-changed` on window.
 */
const RECENT_DIRS_KEY = "harness-kit-sync-recent-dirs";
const CURRENT_KEY = "harness-kit-current-project";
const MAX_RECENT = 10;

export const PROJECT_CHANGED_EVENT = "harness-kit-project-changed";

/** Set only when a write to storage failed, so the session still sees the choice. */
let unsaved: { dir: string | null } | null = null;

function isTilde(dir: string): boolean {
  return dir.startsWith("~");
}

/** The stored recent list as written, `~` entries included. */
function readRecent(): string[] {
  try {
    const dirs = JSON.parse(localStorage.getItem(RECENT_DIRS_KEY) ?? "[]");
    return Array.isArray(dirs) ? dirs.filter((dir): dir is string => typeof dir === "string" && dir !== "") : [];
  } catch {
    return [];
  }
}

/**
 * The stored current project as written: null when never written (or storage
 * is unreadable), "" once cleared.
 */
function readCurrent(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function getRecentProjectDirs(): string[] {
  const recent = readRecent();
  if (recent.some(isTilde)) expandInBackground();
  return recent.filter((dir) => !isTilde(dir));
}

export function getCurrentProjectDir(): string | null {
  if (unsaved) return unsaved.dir;
  const current = readCurrent() ?? readRecent()[0] ?? null;
  if (!current) return null;
  if (isTilde(current)) {
    // Not usable until expanded; the rewrite announces the absolute path.
    expandInBackground();
    return null;
  }
  return current;
}

/**
 * `~` or `~/rest` against `home`; null for anything else starting with `~`
 * (`~user/...` names another account's home, which the app cannot resolve).
 */
function expandTilde(dir: string, home: string): string | null {
  if (!isTilde(dir)) return dir;
  const base = home.replace(/\/+$/, "");
  if (!base) return null;
  if (dir === "~") return base;
  if (dir.startsWith("~/")) return `${base}/${dir.slice(2)}`;
  return null;
}

let expanding: Promise<void> | null = null;
/** Set when storage refused the rewrite, so the getters stop retrying it. */
let rewriteRefused = false;

function expandInBackground(): void {
  if (!rewriteRefused) void expandStoredTildes();
}

/**
 * Rewrite stored `~` paths as absolute ones, dropping any that cannot be
 * expanded (including when the home directory cannot be read). One run at a
 * time; storage is re-read after the home lookup so a choice made meanwhile
 * is kept. Announces the change when it wrote one.
 */
export function expandStoredTildes(): Promise<void> {
  expanding ??= (async () => {
    if (!readRecent().some(isTilde) && !isTilde(readCurrent() ?? "")) return;
    let home = "";
    try {
      home = await homeDir();
    } catch {
      // No home directory: every `~` entry is dropped below.
    }
    const expand = (dir: string) => expandTilde(dir, home);
    const recent = readRecent();
    const current = readCurrent();
    const rewriteRecent = recent.some(isTilde);
    const rewriteCurrent = current !== null && isTilde(current);
    if (!rewriteRecent && !rewriteCurrent) return;
    try {
      if (rewriteRecent) {
        const absolute = recent.map(expand).filter((dir): dir is string => dir !== null);
        localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify([...new Set(absolute)]));
      }
      if (rewriteCurrent) localStorage.setItem(CURRENT_KEY, expand(current) ?? "");
    } catch {
      rewriteRefused = true;
      return;
    }
    window.dispatchEvent(new Event(PROJECT_CHANGED_EVENT));
  })().finally(() => {
    expanding = null;
  });
  return expanding;
}

/**
 * Make `dir` the current project (null clears it; the recent list is kept),
 * then ask Tauri for access to it: choosing a project is the user asking.
 * A `~` path is expanded first and stored absolute; one that cannot be
 * expanded changes nothing.
 */
export function setCurrentProjectDir(dir: string | null): void {
  const next = dir?.trim() ? dir.trim() : null;
  if (next && isTilde(next)) {
    void homeDir()
      .then((home) => expandTilde(next, home), () => null)
      .then((absolute) => {
        if (absolute) setCurrentProjectDir(absolute);
      });
    return;
  }
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
