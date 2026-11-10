type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    const next = { count: 1, resetAt: now + WINDOW_MS };
    buckets.set(key, next);
    return { ok: true, remaining: MAX_REQUESTS - 1, resetAt: next.resetAt };
  }

  if (current.count >= MAX_REQUESTS) {
    return { ok: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { ok: true, remaining: MAX_REQUESTS - current.count, resetAt: current.resetAt };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}
