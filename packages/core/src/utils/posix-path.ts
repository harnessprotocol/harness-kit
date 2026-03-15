/** POSIX path utilities for non-Node environments (browser, Tauri). */

export function posixJoin(...segments: string[]): string {
  return segments
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

export function posixDirname(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash > 0 ? path.substring(0, lastSlash) : "/";
}
