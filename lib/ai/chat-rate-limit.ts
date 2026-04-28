import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const RATE_LIMIT = 60;
const RATE_WINDOW = 3600; // 1 hour in seconds

/**
 * Checks the per-org AI chat rate limit (60 requests per hour).
 * Returns null if the request is allowed, or a 429 NextResponse if the limit is exceeded.
 */
export async function checkOrgRateLimit(organizationId: string): Promise<NextResponse | null> {
  const key = `rate_limit:org:${organizationId}:ai-chat`;
  try {
    const now = Date.now();
    const windowStart = now - RATE_WINDOW * 1000;
    const member = `${now}-${Math.random()}`;

    // Pipeline: remove old + add new + count — 1 round-trip
    const [,, count] = await redis.pipeline()
      .zremrangebyscore(key, 0, windowStart)
      .zadd(key, { score: now, member })
      .zcard(key)
      .expire(key, RATE_WINDOW)
      .exec() as [unknown, unknown, number, unknown];

    if (count > RATE_LIMIT) {
      void redis.zrem(key, member).catch(() => {});
      const resetsAt = new Date(now + RATE_WINDOW * 1000).toISOString();
      return NextResponse.json(
        { error: "Rate limit exceeded", resetsAt },
        { status: 429 }
      );
    }

    return null;
  } catch {
    return null;
  }
}
