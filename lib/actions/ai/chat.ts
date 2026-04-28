"use server";

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export interface ChatMessageRecord {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

function cacheKey(organizationId: string, memberId: string) {
  return `org:${organizationId}:member:${memberId}:chat:recent`;
}

export async function getOrCreateSession(organizationId: string, memberId: string): Promise<string> {
  // Try to find existing session first (fast path — cache in Redis)
  const sessionCacheKey = `org:${organizationId}:member:${memberId}:sessionId`;
  try {
    const cached = await redis.get<string>(sessionCacheKey);
    // Strip surrounding quotes if Redis returned a JSON-encoded string
    if (cached) {
      const clean = typeof cached === "string" ? cached.replace(/^"|"$/g, "") : cached;
      if (clean) return clean;
    }
  } catch {}

  const existing = await prisma.chatSession.findFirst({
    where: { organizationId, memberId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const sessionId = existing
    ? existing.id
    : (await prisma.chatSession.create({ data: { organizationId, memberId }, select: { id: true } })).id;

  // Cache session ID for 1 hour — fire and forget, store as raw string (no JSON encoding)
  void redis.set(sessionCacheKey, sessionId, { ex: 3600 }).catch(() => {});
  return sessionId;
}

export async function getRecentMessages(
  organizationId: string,
  memberId: string,
  sessionId: string
): Promise<ChatMessageRecord[]> {
  const key = cacheKey(organizationId, memberId);
  try {
    const cached = await redis.get<ChatMessageRecord[]>(key);
    if (cached) return cached;
  } catch {}

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId, organizationId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, role: true, content: true, createdAt: true },
  });

  const result = messages.reverse();
  try {
    await redis.setex(key, 300, JSON.stringify(result));
  } catch {}
  return result;
}

export async function persistMessages(
  organizationId: string,
  memberId: string,
  sessionId: string,
  messages: { role: string; content: string }[]
): Promise<void> {
  await prisma.chatMessage.createMany({
    data: messages.map(m => ({
      sessionId,
      organizationId,
      role: m.role,
      content: m.content,
    })),
  });

  // Invalidate cache
  try {
    await redis.del(cacheKey(organizationId, memberId));
  } catch {}
}
