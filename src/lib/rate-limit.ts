/**
 * In-memory sliding-window limiter. It protects a single server instance from bursts; durable limits
 * (e.g. the AI daily budget) are enforced in the database. On multi-instance deployments, put a shared
 * limiter (e.g. Upstash/Redis or the hosting platform's WAF) in front of auth endpoints as well.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): { ok: boolean; retryAfterMs: number } {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterMs: windowMs - (now - hits[0]!) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return { ok: true, retryAfterMs: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}
