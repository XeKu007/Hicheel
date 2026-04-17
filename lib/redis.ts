import { Redis } from "@upstash/redis";

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
    const cached = await redis.get<T>(key);
    if (cached !== null) return cached;

    const data = await fetcher();
    // fire-and-forget cache set — хариу хүлээхгүй
    redis.setex(key, ttl, JSON.stringify(data)).catch(() => {});
    return data;
  } catch {
    // Redis доош унасан ч app ажиллана
    return fetcher();
  }
}

export async function invalidateCache(keys: string[]) {
  try {
    if (keys.length === 0) return;
    // Wildcard keys-г шийдэх
    const resolvedKeys: string[] = [];
    for (const key of keys) {
      if (key.includes("*")) {
        const found = await redis.keys(key);
        resolvedKeys.push(...found);
      } else {
        resolvedKeys.push(key);
      }
    }
    if (resolvedKeys.length > 0) {
      await redis.del(...resolvedKeys);
    }
  } catch {
    // Redis алдаа гарсан ч үргэлжлүүлнэ
  }
}
