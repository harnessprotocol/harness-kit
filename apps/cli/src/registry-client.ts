import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

export const REGISTRY_API_BASE = (process.env.HARNESS_API_URL || "https://api.harnesskit.ai").replace(/\/$/, "");
export const AUTH_PATH = resolve(homedir(), ".harness/auth.json");

interface StoredAuth {
  accessToken: string;
  expiresAt: string;
  apiBase: string;
}

export async function readStoredAuth(): Promise<StoredAuth | null> {
  try {
    const auth = JSON.parse(await readFile(AUTH_PATH, "utf8")) as StoredAuth;
    if (auth.apiBase !== REGISTRY_API_BASE || new Date(auth.expiresAt).getTime() <= Date.now()) return null;
    return auth;
  } catch {
    return null;
  }
}

export async function writeStoredAuth(accessToken: string, expiresIn: number): Promise<void> {
  await mkdir(dirname(AUTH_PATH), { recursive: true });
  const temporary = `${AUTH_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify({
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    apiBase: REGISTRY_API_BASE,
  }, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, AUTH_PATH);
}

export async function registryRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const stored = await readStoredAuth();
  const token = process.env.HARNESS_API_TOKEN ?? stored?.accessToken;
  const response = await fetch(`${REGISTRY_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
  if (!response.ok) throw new Error(body.message ?? body.error ?? `Registry request failed (${response.status})`);
  return body as T;
}

export async function clearStoredAuth(): Promise<void> {
  try {
    await unlink(AUTH_PATH);
  } catch {
    // Already signed out.
  }
}
