import { redis } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

interface RateLimitConfig {
  limit: number;      // max requests
  window: number;     // seconds
  identifier?: string; // custom key prefix
}

/**
 * Rate limiter using Redis sliding window.
 * Returns null if allowed, or a 429 Response if rate limited.
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig = { limit: 60, window: 60 }
): Promise<NextResponse | null> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const prefix = config.identifier ?? request.nextUrl.pathname;
  const key = `rate_limit:${prefix}:${ip}`;

  try {
    const now = Date.now();
    const windowStart = now - config.window * 1000;
    const member = `${now}-${Math.random()}`;

    // Pipeline: remove old + add new + count — 1 round-trip
    const [,, count] = await redis.pipeline()
      .zremrangebyscore(key, 0, windowStart)
      .zadd(key, { score: now, member })
      .zcard(key)
      .expire(key, config.window)
      .exec() as [unknown, unknown, number, unknown];

    if (count > config.limit) {
      // Undo the zadd we just did
      void redis.zrem(key, member).catch(() => {});
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(config.window),
            "X-RateLimit-Limit": String(config.limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    return null; // allowed
  } catch {
    // Redis unavailable — allow request
    return null;
  }
}
