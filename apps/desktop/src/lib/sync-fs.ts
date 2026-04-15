import { homeDir } from "@tauri-apps/api/path";
import { posixJoin, posixDirname } from "@harness-kit/core";
import type { FsProvider } from "@harness-kit/core";
import { syncReadFile, syncFileExists, syncReadDir } from "./tauri";

/**
 * FsProvider implementation that routes all reads through Rust IPC commands,
 * keeping project-directory access outside the Tauri FS plugin scope.
 *
 * Write operations throw — this provider is read-only.
 * Actual writes go through syncWriteFiles() after the dry-run preview.
 */
export class SyncFsProvider implements FsProvider {
  constructor(private readonly projectDir: string) {}

  readFile(path: string): Promise<string> {
    const rel = this.toRelative(path);
    return syncReadFile(this.projectDir, rel);
  }

  exists(path: string): Promise<boolean> {
    const rel = this.toRelative(path);
    return syncFileExists(this.projectDir, rel);
  }

  readDir(path: string): Promise<string[]> {
    const rel = this.toRelative(path);
    return syncReadDir(this.projectDir, rel);
  }

  async isDirectory(path: string): Promise<boolean> {
    // Use readDir — if it resolves, it's a directory; if it throws, it's a file or missing.
    try {
      const rel = this.toRelative(path);
      await syncReadDir(this.projectDir, rel);
      return true;
    } catch {
      return false;
    }
  }

  writeFile(_path: string, _content: string): Promise<void> {
    return Promise.reject(new Error("SyncFsProvider is read-only"));
  }

  renameFile(_from: string, _to: string): Promise<void> {
    return Promise.reject(new Error("SyncFsProvider is read-only"));
  }

  mkdir(_path: string, _options?: { recursive?: boolean }): Promise<void> {
    return Promise.reject(new Error("SyncFsProvider is read-only"));
  }

  joinPath(...segments: string[]): string {
    return posixJoin(...segments);
  }

  dirname(path: string): string {
    return posixDirname(path);
  }

  homedir(): Promise<string> {
    return homeDir();
  }

  cwd(): string {
    return this.projectDir;
  }

  /**
   * Convert an absolute path that starts with projectDir into a relative path.
   * If the path is already relative, return it unchanged.
   */
  private toRelative(path: string): string {
    const normalizedProject = this.projectDir.replace(/\\/g, "/").replace(/\/$/, "");
    const normalizedPath = path.replace(/\\/g, "/");
    if (normalizedPath.startsWith(normalizedProject + "/")) {
      return normalizedPath.slice(normalizedProject.length + 1);
    }
    // Already relative or "." check
    return path;
  }
}
