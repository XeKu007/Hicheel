import { Redis } from "@upstash/redis";

// ── Cache TTL constants (seconds) ──────────────────────────────────────────
export const TTL = {
  SHORT: 120,         // 2 min  — frequently changing data (alerts, inventory)
  MEDIUM: 600,        // 10 min — moderately changing (dashboard, members)
  LONG: 1800,         // 30 min — rarely changing (leaderboard, org context)
  ORG_CONTEXT: 1800,  // 30 min — user org context
} as const;

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = 60
): Promise<T> {
  try {
    // Pipeline: GET + TTL in one round-trip
    const [cached, remainingTtl] = await redis.pipeline()
      .get<T>(key)
      .ttl(key)
      .exec() as [T | null, number];

    if (cached !== null) {
      // Stale-while-revalidate: if past 80% of TTL, refresh in background
      if (remainingTtl > 0 && remainingTtl < ttl * 0.2) {
        fetcher()
          .then((fresh) => redis.setex(key, ttl, fresh as unknown as string))
          .catch(() => {});
      }
      return cached;
    }

    const data = await fetcher();
    redis.setex(key, ttl, data as unknown as string).catch(() => {});
    return data;
  } catch {
    return fetcher();
  }
}

export async function invalidateCache(keys: string[]) {
  try {
    if (keys.length === 0) return;
    const resolvedKeys: string[] = [];
    const wildcardKeys = keys.filter(k => k.includes("*"));
    const exactKeys = keys.filter(k => !k.includes("*"));

    resolvedKeys.push(...exactKeys);

    // Resolve wildcard keys in parallel using SCAN (non-blocking)
    if (wildcardKeys.length > 0) {
      const scanResults = await Promise.all(
        wildcardKeys.map(async (pattern) => {
          const found: string[] = [];
          let cursor = 0;
          do {
            const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 100 });
            found.push(...batch);
            cursor = Number(nextCursor);
          } while (cursor !== 0);
          return found;
        })
      );
      for (const batch of scanResults) resolvedKeys.push(...batch);
    }

    if (resolvedKeys.length === 0) return;

    // Delete all in parallel batches of 20
    const batchPromises: Promise<unknown>[] = [];
    for (let i = 0; i < resolvedKeys.length; i += 20) {
      batchPromises.push(redis.del(...resolvedKeys.slice(i, i + 20)));
    }
    await Promise.all(batchPromises);
  } catch {
    // Redis алдаа гарсан ч үргэлжлүүлнэ
  }
}
