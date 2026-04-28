import { BadgeType, StaffActionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";

export const BADGE_THRESHOLDS: Record<
  BadgeType,
  { actionType: StaffActionType; count: number } | null
> = {
  FIRST_PRODUCT: { actionType: "PRODUCT_CREATED", count: 1 },
  HUNDRED_UPDATES: { actionType: "PRODUCT_UPDATED", count: 100 },
  INVENTORY_CHECKER: { actionType: "INVENTORY_CHECKED", count: 50 },
  TOP_PERFORMER: null, // evaluated separately at leaderboard recomputation
};

/**
 * Checks if a member qualifies for any new badges and creates them.
 * Called asynchronously after action tracking.
 */
export async function evaluateAndAwardBadges(
  memberId: string,
  organizationId: string,
  actionType: StaffActionType
): Promise<void> {
  // Collect all thresholds that match this actionType
  const relevantBadges = (Object.entries(BADGE_THRESHOLDS) as [BadgeType, { actionType: StaffActionType; count: number } | null][])
    .filter(([, threshold]) => threshold && threshold.actionType === actionType) as [BadgeType, { actionType: StaffActionType; count: number }][];

  if (relevantBadges.length === 0) return;

  // Single count query (all relevant badges share the same actionType)
  const count = await prisma.staffAction.count({
    where: { memberId, organizationId, type: actionType },
  });

  // Check which badges qualify and award in parallel
  const upsertResults = await Promise.allSettled(
    relevantBadges
      .filter(([, threshold]) => count >= threshold.count)
      .map(async ([badgeType]) => {
        // First check if badge already exists to avoid Prisma error logs
        const existing = await prisma.badge.findUnique({
          where: { memberId_organizationId_type: { memberId, organizationId, type: badgeType } },
          select: { id: true },
        });
        if (existing) return false; // already awarded

        // Create — if another request races and creates first, ignore the error
        try {
          await prisma.badge.create({ data: { memberId, organizationId, type: badgeType } });
          return true;
        } catch {
          return false; // duplicate — already awarded by concurrent request
        }
      })
  );

  const anyBadgeAwarded = upsertResults.some(r => r.status === "fulfilled" && r.value === true);

  if (anyBadgeAwarded) {
    void invalidateCache([`org:${organizationId}:leaderboard`]).catch(() => {});
  }
}
