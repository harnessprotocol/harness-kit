const MIN_MS = 2_000;
const MAX_MS = 30_000;

/** Returns the next backoff interval: doubles current, clamped to [MIN_MS, MAX_MS]. */
export function nextBackoffMs(currentMs: number): number {
  return Math.min(MAX_MS, Math.max(MIN_MS, currentMs * 2));
}

/** Returns the reset (minimum) backoff interval. */
export function resetBackoffMs(): number {
  return MIN_MS;
}
