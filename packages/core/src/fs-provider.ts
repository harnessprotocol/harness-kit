export interface FsProvider {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readDir(path: string): Promise<string[]>;
  isDirectory(path: string): Promise<boolean>;
  renameFile(from: string, to: string): Promise<void>;
  joinPath(...segments: string[]): string;
  dirname(path: string): string;
  homedir(): Promise<string>;
  cwd(): string;
}
