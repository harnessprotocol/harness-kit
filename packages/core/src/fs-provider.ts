/**
 * Filesystem abstraction all core IO goes through.
 *
 * Surface observation (observe/) assumes `exists` and `isDirectory` are
 * non-throwing boolean probes — a provider that throws from them is out of
 * contract, and observeAllSurfaces catches such throws only as a backstop
 * (degrading that surface, never crashing the sweep).
 */
export interface FsProvider {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readDir(path: string): Promise<string[]>;
  /** Optional unfiltered directory listing for security validation. */
  readDirAll?(path: string): Promise<string[]>;
  isDirectory(path: string): Promise<boolean>;
  renameFile(from: string, to: string): Promise<void>;
  /** Optional for providers that support transactional delete/rollback. */
  removeFile?(path: string): Promise<void>;
  /** Optional lstat-based safety signal used by capsule validation. */
  isSymlink?(path: string): Promise<boolean>;
  /** Optional POSIX mode support used to preserve sensitive config permissions. */
  getFileMode?(path: string): Promise<number | null>;
  setFileMode?(path: string, mode: number): Promise<void>;
  joinPath(...segments: string[]): string;
  dirname(path: string): string;
  homedir(): Promise<string>;
  cwd(): string;
}
