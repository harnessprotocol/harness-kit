/**
 * The single "current project" directory the desktop app tracks — same
 * localStorage convention used by SyncPage/ParityDashboardPage
 * (harness-kit-sync-recent-dirs, most-recent-first). There is no
 * multi-project tracked registry yet (see DESIGN.md Fleet contract: scope
 * honestly to Global + the open project, don't fake more).
 */
const RECENT_DIRS_KEY = "harness-kit-sync-recent-dirs";

export function getCurrentProjectDir(): string | null {
  try {
    const dirs = JSON.parse(localStorage.getItem(RECENT_DIRS_KEY) ?? "[]");
    return Array.isArray(dirs) && typeof dirs[0] === "string" && dirs[0] ? dirs[0] : null;
  } catch {
    return null;
  }
}

export function projectDirLabel(dir: string): string {
  const parts = dir.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || dir;
}
