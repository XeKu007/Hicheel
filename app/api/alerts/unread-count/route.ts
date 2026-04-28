import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org";
import { getCached, TTL } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  // Run rate limit and org context in parallel to save one round-trip
  const [limited, ctx] = await Promise.all([
    rateLimit(request, { limit: 120, window: 60, identifier: "alerts:count" }),
    getOrgContext().catch(() => null),
  ]);
  if (limited) return NextResponse.json({ count: 0 });
  if (!ctx) return NextResponse.json({ count: 0 });

  try {
    const count = await getCached(
      `org:${ctx.organizationId}:alerts:unread_count`,
      () => prisma.alert.count({
        where: { organizationId: ctx.organizationId, status: "UNREAD" },
      }),
      TTL.SHORT
    );
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
