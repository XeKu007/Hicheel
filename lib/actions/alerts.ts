"use server";

import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getCached, invalidateCache, TTL } from "@/lib/redis";
import type { Alert } from "@prisma/client";
import type { OrgContext } from "@/lib/org";

const PAGE_SIZE = 20;

export async function getAlerts(
  page: number,
  ctxOverride?: OrgContext
): Promise<{ alerts: Alert[]; total: number }> {
  const ctx = ctxOverride ?? await getOrgContext();
  const MAX_PAGE = 500;
  const safePage = Math.min(MAX_PAGE, Math.max(1, page));
  const cacheKey = `org:${ctx.organizationId}:alerts:page:${safePage}`;

  return getCached(
    cacheKey,
    async () => {
      const skip = (safePage - 1) * PAGE_SIZE;
      const [alerts, total] = await Promise.all([
        prisma.alert.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: { createdAt: "desc" },
          skip,
          take: PAGE_SIZE,
        }),
        prisma.alert.count({
          where: { organizationId: ctx.organizationId },
        }),
      ]);
      return { alerts, total };
    },
    30
  );
}

export async function getUnreadAlertCount(ctxOverride?: OrgContext): Promise<number> {
  const ctx = ctxOverride ?? await getOrgContext();
  return getCached(
    `org:${ctx.organizationId}:alerts:unread_count`,
    () => prisma.alert.count({
      where: { organizationId: ctx.organizationId, status: "UNREAD" },
    }),
    TTL.SHORT
  );
}

export async function dismissAlert(alertId: string): Promise<{ error?: string }> {
  const ctx = await getOrgContext();

  const result = await prisma.alert.updateMany({
    where: { id: alertId, organizationId: ctx.organizationId, status: "UNREAD" },
    data: { status: "DISMISSED", dismissedById: ctx.memberId, dismissedAt: new Date() },
  });

  if (result.count === 0) {
    return { error: "Alert not found or already dismissed." };
  }

  // Invalidate unread count + all cached pages (pages 1-10 covers most cases)
  const pageKeys = Array.from({ length: 10 }, (_, i) => `org:${ctx.organizationId}:alerts:page:${i + 1}`);
  void invalidateCache([
    `org:${ctx.organizationId}:alerts:unread_count`,
    ...pageKeys,
  ]).catch(() => {});

  return {};
}

export async function dismissAllAlerts(): Promise<void> {
  const ctx = await getOrgContext();

  await prisma.alert.updateMany({
    where: { organizationId: ctx.organizationId, status: "UNREAD" },
    data: { status: "DISMISSED", dismissedById: ctx.memberId, dismissedAt: new Date() },
  });

  // Invalidate unread count + all cached pages
  const pageKeys = Array.from({ length: 10 }, (_, i) => `org:${ctx.organizationId}:alerts:page:${i + 1}`);
  void invalidateCache([
    `org:${ctx.organizationId}:alerts:unread_count`,
    ...pageKeys,
  ]).catch(() => {});
}
