export interface FsProvider {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readDir(path: string): Promise<string[]>;
  joinPath(...segments: string[]): string;
  homedir(): Promise<string>;
  cwd(): string;
}
