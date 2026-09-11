const INSTALLATION_ID_KEY = "harness-kit-installation-id";

/**
 * Stable per-install identifier, persisted in localStorage. Used to tag
 * portability snapshots (Drift, Machine's Activity tab) with a consistent
 * installation id across sessions.
 */
export function installationId(): string {
  const existing = localStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const created = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `desktop-${Date.now().toString(36)}`;
  localStorage.setItem(INSTALLATION_ID_KEY, created);
  return created;
}
