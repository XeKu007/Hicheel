"use server";

import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getCached, TTL } from "@/lib/redis";
import type { BadgeType } from "@prisma/client";
import type { OrgContext } from "@/lib/org";

export interface LeaderboardEntry {
  memberId: string;
  displayName: string;
  points: number;
  rank: number;
  badges: string[];
  lastActionAt: Date | null;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  selfEntry: LeaderboardEntry | null;
}

export async function getLeaderboard(ctxOverride?: OrgContext): Promise<LeaderboardData> {
  const ctx = ctxOverride ?? await getOrgContext();
  const cacheKey = `org:${ctx.organizationId}:leaderboard`;

  return getCached(
    cacheKey,
    async () => {
      // Single DB round-trip: aggregate points + last action per member via SQL
      const [memberScores, allBadges] = await Promise.all([
        prisma.$queryRaw<{
          member_id: string;
          user_id: string;
          display_name: string | null;
          email: string | null;
          points: bigint;
          last_action_at: Date | null;
        }[]>`
          SELECT
            m.id            AS member_id,
            m."userId"      AS user_id,
            m."displayName" AS display_name,
            m.email,
            COALESCE(SUM(
              CASE sa.type
                WHEN 'PRODUCT_CREATED'   THEN 10
                WHEN 'PRODUCT_UPDATED'   THEN 5
                WHEN 'INVENTORY_CHECKED' THEN 1
                ELSE 0
              END
            ), 0) AS points,
            MAX(sa."createdAt") AS last_action_at
          FROM "Member" m
          LEFT JOIN "StaffAction" sa
            ON sa."memberId" = m.id
            AND sa."organizationId" = ${ctx.organizationId}
          WHERE m."organizationId" = ${ctx.organizationId}
          GROUP BY m.id, m."userId", m."displayName", m.email
          ORDER BY points DESC, last_action_at ASC NULLS LAST
        `,
        prisma.badge.findMany({
          where: { organizationId: ctx.organizationId },
          select: { memberId: true, type: true },
        }),
      ]);

      // Group badges by memberId
      const badgesByMember = new Map<string, BadgeType[]>();
      for (const badge of allBadges) {
        const existing = badgesByMember.get(badge.memberId) ?? [];
        existing.push(badge.type);
        badgesByMember.set(badge.memberId, existing);
      }

      // Build ranked entries
      const rankedEntries: LeaderboardEntry[] = memberScores.map((row, index) => ({
        memberId: row.member_id,
        displayName: row.display_name ?? row.email ?? row.user_id.slice(0, 8),
        points: Number(row.points),
        rank: index + 1,
        badges: (badgesByMember.get(row.member_id) ?? []) as string[],
        lastActionAt: row.last_action_at,
      }));

      const top10 = rankedEntries.slice(0, 10);

      const selfInTop10 = top10.some((e) => e.memberId === ctx.memberId);
      const selfEntry = selfInTop10
        ? null
        : (rankedEntries.find((e) => e.memberId === ctx.memberId) ?? null);

      return { entries: top10, selfEntry };
    },
    TTL.MEDIUM  // 5 min — points are awarded immediately, keep leaderboard reasonably fresh
  );
}