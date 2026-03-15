import type { FsProvider } from "../../src/fs-provider.js";
import { posixJoin, posixDirname } from "../../src/utils/posix-path.js";

export class MockFsProvider implements FsProvider {
  private files: Map<string, string>;
  private _cwd: string;
  private _homedir: string;

  constructor(
    initialFiles: Record<string, string> = {},
    cwd = "/project",
    homedir = "/home/user",
  ) {
    this.files = new Map(Object.entries(initialFiles));
    this._cwd = cwd;
    this._homedir = homedir;
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file: ${path}`);
    }
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    // Check exact file match
    if (this.files.has(path)) return true;
    // Check if it's a "directory" (any file starts with path/)
    const prefix = path.endsWith("/") ? path : path + "/";
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  async mkdir(_path: string, _options?: { recursive?: boolean }): Promise<void> {
    // No-op for mock — directories are implicit
  }

  async readDir(path: string): Promise<string[]> {
    const prefix = path.endsWith("/") ? path : path + "/";
    const entries = new Set<string>();
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const first = rest.split("/")[0];
        entries.add(first);
      }
    }
    return [...entries];
  }

  joinPath(...segments: string[]): string {
    return posixJoin(...segments);
  }

  dirname(path: string): string {
    return posixDirname(path);
  }

  async homedir(): Promise<string> {
    return this._homedir;
  }

  cwd(): string {
    return this._cwd;
  }

  // Test helpers
  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  getAllFiles(): Record<string, string> {
    return Object.fromEntries(this.files);
  }
}
