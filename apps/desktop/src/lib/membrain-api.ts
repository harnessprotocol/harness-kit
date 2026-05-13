// membrain API client — health checks and base URL constants
// The iframe handles all real API calls; this module is for health polling only.
export const MEMBRAIN_PORT = 3131;
export const MEMBRAIN_SERVER_BASE = `http://localhost:${MEMBRAIN_PORT}`;
export const MEMBRAIN_API = `${MEMBRAIN_SERVER_BASE}/api/v1`;

export interface MembrainAttestation {
  ok: boolean;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasMembrainStatsShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['entities', 'relations', 'episodes'].every((key) => typeof value[key] === 'number');
}

export async function verifyMembrainServer(signal?: AbortSignal): Promise<MembrainAttestation> {
  const expectedOrigin = new URL(MEMBRAIN_SERVER_BASE).origin;
  if (expectedOrigin !== `http://localhost:${MEMBRAIN_PORT}`) {
    return { ok: false, reason: 'Unexpected membrain origin.' };
  }

  try {
    const statsRes = await fetch(`${MEMBRAIN_API}/graph/stats`, {
      signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!statsRes.ok) return { ok: false, reason: 'membrain stats endpoint did not respond.' };

    const stats = await statsRes.json();
    if (!hasMembrainStatsShape(stats)) {
      return { ok: false, reason: 'membrain stats endpoint returned an unexpected shape.' };
    }

    const rootRes = await fetch(MEMBRAIN_SERVER_BASE, {
      signal,
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    });
    if (!rootRes.ok) return { ok: false, reason: 'membrain web app did not respond.' };

    const rootHtml = await rootRes.text();
    if (!rootHtml.toLowerCase().includes('membrain')) {
      return { ok: false, reason: 'membrain web app identity could not be verified.' };
    }

    return { ok: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, reason: 'membrain verification was cancelled.' };
    }
    return { ok: false, reason: 'membrain verification failed.' };
  }
}

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

// ── Harness Kit theme sync ────────────────────────────────────────────────────
// Pushes matching HK palette to membrain so the iframe feels native.

const FONTS = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
};

const HK_THEME_DARK = {
  name: 'harness-kit',
  colors: {
    bg:        '#0b0d12',
    surface:   '#12151c',
    fg:        '#e6e8ee',
    muted:     '#9aa0ad',
    subtle:    '#6b7280',
    accent:    '#22b1ec',
    highlight: '#4ec7f2',
    secondary: '#4ec7f2',
    success:   '#10b981',
    warning:   '#d97706',
    error:     '#dc2626',
  },
  fonts: FONTS,
  ui: { radius: '8px', sidebar_width: '240px' },
};

const HK_THEME_LIGHT = {
  name: 'harness-kit-light',
  colors: {
    bg:        '#f5f7fa',
    surface:   '#ffffff',
    fg:        '#0f172a',
    muted:     '#475569',
    subtle:    '#94a3b8',
    accent:    '#0ea5e9',
    highlight: '#0284c7',
    secondary: '#0284c7',
    success:   '#10b981',
    warning:   '#d97706',
    error:     '#dc2626',
  },
  fonts: FONTS,
  ui: { radius: '8px', sidebar_width: '240px' },
};

/** Push the HK-matched theme to membrain. Best-effort — never throws. */
export function syncMembrainTheme(): void {
  const isDark = document.documentElement.classList.contains('dark');
  fetch(`${MEMBRAIN_API}/theme`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(isDark ? HK_THEME_DARK : HK_THEME_LIGHT),
  }).catch(() => {});
}
