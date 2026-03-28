interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

/**
 * In-memory sliding-window rate limiter.
 *
 * Keyed by an arbitrary string (e.g. "install:<ip>:<slug>"). Expired entries
 * are pruned on each call so the Map doesn't grow unbounded.
 *
 * NOTE: This is per-process. In a multi-instance deployment use an external
 * store (Redis / Cloudflare KV). Sufficient for a single-instance launch.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();

  // Prune expired entries to prevent memory growth.
  for (const [k, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(k);
  }

  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Extract the client IP from a request, preferring Cloudflare headers.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
