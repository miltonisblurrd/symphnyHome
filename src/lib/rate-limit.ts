type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  return {
    ok: true,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
  };
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
