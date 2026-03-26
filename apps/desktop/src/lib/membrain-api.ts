// membrain API client — health checks and base URL constants
// The iframe handles all real API calls; this module is for health polling only.
export const MEMBRAIN_PORT = 3131;
export const MEMBRAIN_SERVER_BASE = `http://localhost:${MEMBRAIN_PORT}`;
export const MEMBRAIN_API = `${MEMBRAIN_SERVER_BASE}/api/v1`;

export async function checkMembrainHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${MEMBRAIN_API}/graph/stats`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
