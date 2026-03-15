import { readFile, writeFile, access, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
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
    return readdir(path);
  }

  joinPath(...segments: string[]): string {
    return join(...segments);
  }

  async homedir(): Promise<string> {
    return homedir();
  }

  cwd(): string {
    return this._cwd;
  }
}
