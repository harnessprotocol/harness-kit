import type { FsProvider } from "../fs-provider.js";

/** Read a JSON file, returning a default value on missing file or parse error. */
export async function readJsonOrDefault<T>(
  fs: FsProvider,
  path: string,
  defaultValue: T,
): Promise<{ data: T; existed: boolean }> {
  try {
    const raw = await fs.readFile(path);
    return { data: JSON.parse(raw) as T, existed: true };
  } catch {
    return { data: defaultValue, existed: false };
  }
}
