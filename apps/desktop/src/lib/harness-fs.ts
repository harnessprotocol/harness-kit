import {
  readTextFile,
  writeTextFile,
  exists,
  mkdir,
  readDir,
} from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import type { FsProvider } from "@harness-kit/core";
import { posixJoin, posixDirname } from "@harness-kit/core";

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

  async writeFile(path: string, content: string): Promise<void> {
    await writeTextFile(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return exists(path);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await mkdir(path, { recursive: options?.recursive ?? false });
  }

  async readDir(path: string): Promise<string[]> {
    const entries = await readDir(path);
    return entries.map((e) => e.name).filter((n): n is string => n != null);
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
