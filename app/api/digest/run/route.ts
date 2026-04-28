import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export interface DigestReport {
  organizationId: string;
  date: string;
  totalInventoryValue: number;
  currencyCode: string;
  newProductsCount: number;
  dispatchCount: number;
  newAlertsCount: number;
  dismissedAlertsCount: number;
  computedAt: string;
}

function getUBDateRange(): { start: Date; end: Date; dateStr: string } {
  // Ulaanbaatar = UTC+8 (Mongolia does not observe DST, so offset is always +8)
  // Using fixed offset is correct for UB — no DST adjustment needed.
  const UB_OFFSET_MS = 8 * 60 * 60 * 1000;
  const nowUTC = new Date();
  const nowUB = new Date(nowUTC.getTime() + UB_OFFSET_MS);

  // Yesterday in UB time
  const yesterdayUB = new Date(nowUB);
  yesterdayUB.setUTCDate(yesterdayUB.getUTCDate() - 1);

  const dateStr = yesterdayUB.toISOString().slice(0, 10);

  // Start of yesterday in UB = dateStr 00:00:00 UB = dateStr 00:00:00 UTC - 8h
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  start.setTime(start.getTime() - UB_OFFSET_MS);

  // End of yesterday in UB = dateStr 23:59:59.999 UB = dateStr 23:59:59.999 UTC - 8h
  const end = new Date(`${dateStr}T23:59:59.999Z`);
  end.setTime(end.getTime() - UB_OFFSET_MS);

  return { start, end, dateStr };
}

async function computeDigest(orgId: string, currency: string, start: Date, end: Date, dateStr: string): Promise<DigestReport> {
  // Use DB aggregation instead of fetching all products into memory
  const [inventoryAgg, newProducts, dispatchActions, newAlerts, dismissedAlerts] = await Promise.all([
    prisma.$queryRaw<[{ total: string }]>`
      SELECT COALESCE(SUM(price * quantity), 0)::text AS total
      FROM "Product"
      WHERE "organizationId" = ${orgId}
    `,
    prisma.product.count({
      where: { organizationId: orgId, createdAt: { gte: start, lte: end } },
    }),
    // Fetch only dispatch actions (quantityAfter < quantityBefore) in date range
    prisma.staffAction.findMany({
      where: {
        organizationId: orgId,
        type: "PRODUCT_UPDATED",
        createdAt: { gte: start, lte: end },
        quantityBefore: { not: null },
        quantityAfter: { not: null },
      },
      select: { quantityBefore: true, quantityAfter: true },
    }),
    prisma.alert.count({
      where: { organizationId: orgId, createdAt: { gte: start, lte: end } },
    }),
    prisma.alert.count({
      where: { organizationId: orgId, dismissedAt: { gte: start, lte: end } },
    }),
  ]);

  const totalInventoryValue = Number(inventoryAgg[0]?.total ?? 0);
  const dispatchCount = dispatchActions.filter(
    a => a.quantityBefore !== null && a.quantityAfter !== null &&
         typeof a.quantityBefore === "number" && typeof a.quantityAfter === "number" &&
         a.quantityAfter < a.quantityBefore
  ).length;

  return {
    organizationId: orgId,
    date: dateStr,
    totalInventoryValue,
    currencyCode: currency,
    newProductsCount: newProducts,
    dispatchCount,
    newAlertsCount: newAlerts,
    dismissedAlertsCount: dismissedAlerts,
    computedAt: new Date().toISOString(),
  };
}

async function runDigest() {
  const { start, end, dateStr } = getUBDateRange();

  const orgs = await prisma.organization.findMany({
    select: { id: true, currency: true },
  });

  await Promise.allSettled(
    orgs.map(async (org) => {
      try {
        const report = await computeDigest(org.id, org.currency, start, end, dateStr);
        await redis.setex(
          `org:${org.id}:digest:latest`,
          48 * 60 * 60,
          JSON.stringify(report)
        );
      } catch (err) {
        console.error(`[digest] Failed for org ${org.id}:`, err);
      }
    })
  );
}

export async function POST(request: Request) {
  const auth = request.headers.get("Authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await runDigest();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[digest/run] Failed:", err);
    // Retry once after 5 minutes
    setTimeout(() => runDigest().catch(console.error), 5 * 60 * 1000);
    return NextResponse.json({ error: "Digest failed, retry scheduled" }, { status: 500 });
  }
}
