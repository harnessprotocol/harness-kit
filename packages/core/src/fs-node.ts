import { readFile, writeFile, access, mkdir, readdir, lstat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { FsProvider } from "./fs-provider.js";

export class NodeFsProvider implements FsProvider {
  private _cwd: string;

  constructor(cwd?: string) {
    this._cwd = cwd ?? process.cwd();
  }

  async readFile(path: string): Promise<string> {
    return readFile(path, "utf-8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    await writeFile(path, content, "utf-8");
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await mkdir(path, options);
  }

  async readDir(path: string): Promise<string[]> {
    // Use withFileTypes to filter out symlinks, preventing path traversal
    // via symlinked directories that point outside the plugin tree.
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => !e.isSymbolicLink()).map((e) => e.name);
  }

  async isSymlink(path: string): Promise<boolean> {
    try {
      const stat = await lstat(path);
      return stat.isSymbolicLink();
    } catch {
      return false;
    }
  }

  joinPath(...segments: string[]): string {
    return join(...segments);
  }

  dirname(path: string): string {
    return dirname(path);
  }

  async homedir(): Promise<string> {
    return homedir();
  }

  cwd(): string {
    return this._cwd;
  }
}
