import {
  readTextFile,
  exists,
  mkdir,
  readDir,
  lstat,
} from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import type { FsProvider } from "@harness-kit/core";
import { posixJoin, posixDirname } from "@harness-kit/core";

/**
 * Whether the FINAL path segment is an engine temp name (`<name>.harness-tmp-<suffix>`,
 * the same test the Rust guard applies). A marker in a directory name does not count.
 */
function isEngineTempName(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const marker = ".harness-tmp-";
  const at = name.lastIndexOf(marker);
  return at > 0 && name.length > at + marker.length;
}

/**
 * FsProvider implementation for Tauri desktop apps.
 * Uses Tauri's FS plugin and path APIs — runs in the browser/webview context.
 */
export class TauriFsProvider implements FsProvider {
  private _cwd: string;

  constructor(cwd: string) {
    this._cwd = cwd;
  }

  async readFile(path: string): Promise<string> {
    return readTextFile(path);
  }

  // The fs plugin's write is not granted to the webview (a scope cannot tell
  // a hooks file from a temp file). The Rust command writes only the engine's
  // `.harness-tmp-<suffix>` file beside a declared home store, or beside a
  // declared project store inside a project root the user picked, and refuses
  // everything else (including anything under `.git`).
  async writeFile(path: string, content: string): Promise<void> {
    await invoke("guarded_write_file", { path, content });
  }

  async exists(path: string): Promise<boolean> {
    try {
      return await exists(path);
    } catch {
      // Tauri's fs plugin throws "forbidden path" for paths outside the
      // capability fs:scope. Platform detection probes many candidate paths
      // (some intentionally outside scope, e.g. ~/opencode.json) — for those,
      // "unreadable" means "not present here", not a fatal error. Returning
      // false keeps detection robust instead of crashing the whole scan.
      return false;
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await mkdir(path, { recursive: options?.recursive ?? false });
  }

  async readDir(path: string): Promise<string[]> {
    const entries = await readDir(path);
    return entries.map((e) => e.name).filter((n): n is string => n != null);
  }

  async readDirAll(path: string): Promise<string[]> {
    return this.readDir(path);
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const info = await lstat(path);
      return info.isDirectory;
    } catch {
      return false;
    }
  }

  // The fs plugin's rename and remove are not granted to the webview: a
  // capability scope cannot refuse symlinks or recursive deletes. These Rust
  // commands accept a temp file renamed onto its own declared store (home, or
  // a project store), refuse a symlink source, delete only temp files and
  // backups (removing a store moves it to quarantine), and never remove a
  // directory.
  async renameFile(from: string, to: string): Promise<void> {
    try {
      await invoke("guarded_rename_file", { from, to });
    } catch (err) {
      // A refused rename leaves the engine's temp file behind; clear it
      // best-effort and report the refusal, not the cleanup. Only a temp
      // file: a refused rename of anything else must not delete its source.
      if (isEngineTempName(from)) {
        try {
          await invoke("guarded_remove_file", { path: from });
        } catch {
          /* best effort */
        }
      }
      throw err;
    }
  }

  async removeFile(path: string): Promise<void> {
    await invoke("guarded_remove_file", { path });
  }

  async isSymlink(path: string): Promise<boolean> {
    try {
      const info = await lstat(path);
      return info.isSymlink;
    } catch {
      return false;
    }
  }

  joinPath(...segments: string[]): string {
    return posixJoin(...segments);
  }

  dirname(path: string): string {
    return posixDirname(path);
  }

  async homedir(): Promise<string> {
    return homeDir();
  }

  cwd(): string {
    return this._cwd;
  }
}
