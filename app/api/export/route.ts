import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, requireRole } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { sanitizeCsvValue } from "@/lib/api-utils";
import { rateLimit } from "@/lib/rate-limit";
import { getCached } from "@/lib/redis";

function toCSV(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    const safe = sanitizeCsvValue(v);
    const s = String(safe ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.map(escape).join(","),
    ...rows.map(row => row.map(escape).join(",")),
  ].join("\n");
}

export async function GET(request: NextRequest) {
  // 10 exports/min per IP — CSV generation is expensive
  const limited = await rateLimit(request, { limit: 10, window: 60, identifier: "export" });
  if (limited) return limited;

  try {
    const ctx = await getOrgContext();

    // Only MANAGER can export
    requireRole(ctx, "MANAGER");

    const type = request.nextUrl.searchParams.get("type") ?? "activity";
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Cache key per org + type + day — exports are expensive, cache for 5 min
    const cacheKey = `org:${ctx.organizationId}:export:${type}:${now.toISOString().slice(0, 10)}`;

    let csv = "";
    let filename = "";

    if (type === "activity") {
      // Last 1 month: all add/remove/update actions with product info
      type ActionWithMember = {
        id: string;
        type: string;
        createdAt: Date;
        productId: string | null;
        productName: string | null;
        quantityBefore: number | null;
        quantityAfter: number | null;
        member: { displayName: string | null; email: string | null; role: string } | null;
      };
      const actions = (await prisma.staffAction.findMany({
        where: {
          organizationId: ctx.organizationId,
          createdAt: { gte: oneMonthAgo },
          type: { in: ["PRODUCT_CREATED", "PRODUCT_UPDATED"] },
        },
        include: {
          member: { select: { displayName: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5000, // Safety limit — 5k rows max per export
      })) as unknown as ActionWithMember[];

      // Build product name map only for actions missing productName — single batch query
      const missingProductIds = [...new Set(
        actions.filter(a => !a.productName && a.productId).map(a => a.productId!)
      )];
      const productMap = missingProductIds.length > 0
        ? new Map(
            (await prisma.product.findMany({
              where: { id: { in: missingProductIds } },
              select: { id: true, name: true },
            })).map(p => [p.id, p.name])
          )
        : new Map<string, string>();

      csv = toCSV(
        ["Date", "Time", "Action", "Product", "Staff Name", "Staff Email", "Role", "Qty Before", "Qty After", "Change"],
        actions.map(a => {
          const actionLabel =
            a.type === "PRODUCT_CREATED" ? "Added Product" :
            a.type === "PRODUCT_UPDATED" ? "Updated Product" : a.type;

          const name = a.productName ?? (a.productId ? productMap.get(a.productId) ?? "" : "");

          const qtyBefore = a.quantityBefore !== null && a.quantityBefore !== undefined ? String(a.quantityBefore) : "-";
          const qtyAfter = a.quantityAfter !== null && a.quantityAfter !== undefined ? String(a.quantityAfter) : "-";
          const change = (a.quantityBefore !== null && a.quantityBefore !== undefined &&
                          a.quantityAfter !== null && a.quantityAfter !== undefined)
            ? String(a.quantityAfter - a.quantityBefore)
            : "-";

          return [
            a.createdAt.toISOString().slice(0, 10),
            a.createdAt.toISOString().slice(11, 19),
            actionLabel,
            name,
            a.member?.displayName ?? "",
            a.member?.email ?? "",
            a.member?.role ?? "",
            qtyBefore,
            qtyAfter,
            change,
          ];
        })
      );
      filename = `activity-log-${now.toISOString().slice(0, 10)}.csv`;

    } else if (type === "daily") {
      // Today's activity
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      type DailyAction = {
        type: string;
        createdAt: Date;
        productName: string | null;
        quantityBefore: number | null;
        quantityAfter: number | null;
        member: { displayName: string | null; email: string | null } | null;
      };
      const actions = (await prisma.staffAction.findMany({
        where: {
          organizationId: ctx.organizationId,
          createdAt: { gte: todayStart },
        },
        include: {
          member: { select: { displayName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 2000,
      })) as unknown as DailyAction[];

      csv = toCSV(
        ["Time", "Action", "Product", "Staff", "Qty Before", "Qty After"],
        actions.map(a => [
          a.createdAt.toISOString().slice(11, 19),
          a.type.replace("_", " "),
          a.productName ?? "",
          a.member?.displayName ?? a.member?.email ?? "",
          a.quantityBefore !== null && a.quantityBefore !== undefined ? String(a.quantityBefore) : "-",
          a.quantityAfter !== null && a.quantityAfter !== undefined ? String(a.quantityAfter) : "-",
        ])
      );
      filename = `daily-report-${now.toISOString().slice(0, 10)}.csv`;

    } else if (type === "inventory") {
      const products = await getCached(
        cacheKey + ":inv",
        () => prisma.product.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: { name: "asc" },
          select: {
            name: true, sku: true, price: true, quantity: true,
            lowStockAt: true, createdAt: true,
          },
          take: 10000, // Safety limit
        }),
        300 // 5 min cache
      );

      csv = toCSV(
        ["Name", "SKU", "Price", "Quantity", "Low Stock At", "Status", "Created At"],
        products.map(p => {
          const isOut = p.quantity === 0;
          const isLow = !isOut && p.lowStockAt !== null && p.quantity <= p.lowStockAt;
          return [
            p.name, p.sku ?? "", Number(p.price), p.quantity, p.lowStockAt ?? "",
            isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock",
            p.createdAt.toISOString().slice(0, 10),
          ];
        })
      );
      filename = `inventory-${now.toISOString().slice(0, 10)}.csv`;

    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return new NextResponse("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Only managers can export data." }, { status: 403 });
    }
    console.error("[export]", err);
    return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 });
  }
}
