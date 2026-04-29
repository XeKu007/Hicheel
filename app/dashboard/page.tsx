import ProductsChart from "@/components/products-chart";
import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import TiltCard from "@/components/tilt-card";
import DigestCard from "@/components/digest-card";
import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getCached, TTL } from "@/lib/redis";
import { formatCurrency } from "@/lib/i18n/currency";
import { getOrgPlan, hasFeature } from "@/lib/billing";
import Link from "next/link";
import { Suspense } from "react";

async function getDashboardData(organizationId: string, orgName: string) {
  return getCached(
    "org:" + organizationId + ":dashboard",
    async () => {
      const twelveWeeksAgo = new Date();
      twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

      // Run all queries in a single transaction batch for minimum round-trips
      const [totalProducts, lowStock, outOfStockCount, totalValueRaw, inStockCount, recent, weeklyRaw] = await prisma.$transaction([
        prisma.product.count({ where: { organizationId } }),
        prisma.product.count({ where: { organizationId, lowStockAt: { not: null }, quantity: { lte: 5 } } }),
        prisma.product.count({ where: { organizationId, quantity: 0 } }),
        prisma.$queryRaw<[{ total: string }]>`
          SELECT COALESCE(SUM(price * quantity), 0)::text AS total
          FROM "Product" WHERE "organizationId" = ${organizationId}
        `,
        prisma.product.count({ where: { organizationId, quantity: { gt: 5 } } }),
        prisma.product.findMany({
          where: { organizationId }, orderBy: { createdAt: "desc" }, take: 8,
          select: { id: true, name: true, sku: true, quantity: true, lowStockAt: true, price: true },
        }),
        // Weekly counts via DB aggregation — avoids fetching all rows into memory
        prisma.$queryRaw<{ week_start: Date; count: bigint }[]>`
          SELECT
            date_trunc('week', "createdAt" AT TIME ZONE 'UTC') AS week_start,
            COUNT(*)::bigint AS count
          FROM "Product"
          WHERE "organizationId" = ${organizationId}
            AND "createdAt" >= ${twelveWeeksAgo}
          GROUP BY week_start
          ORDER BY week_start ASC
        `,
      ]);

      const totalValue = Number((totalValueRaw as [{ total: string }])[0]?.total ?? 0);
      return { totalProducts, lowStock, outOfStockCount, totalValue, inStockCount, recent, weeklyRaw, orgName };
    },
    TTL.MEDIUM
  );
}

export default async function DashboardPage() {
  // Fire getOrgContext and dashboard data in parallel — saves one sequential round-trip
  const ctxPromise = getOrgContext();

  // We need organizationId before fetching data, so await ctx first,
  // then fire both data fetches in parallel
  const ctx = await ctxPromise;
  const { organizationId, role, orgName = "", locale } = ctx;

  const [{ totalProducts, lowStock, outOfStockCount, totalValue, inStockCount, recent, weeklyRaw }, unreadCount, plan] = await Promise.all([
    getDashboardData(organizationId, orgName),
    getCached(
      `org:${organizationId}:alerts:unread_count`,
      () => prisma.alert.count({ where: { organizationId, status: "UNREAD" } }),
      TTL.SHORT
    ).catch(() => 0),
    getOrgPlan(organizationId),
  ]);

  const canUseDigest = hasFeature(plan, "dailyDigest");

  const inStockPct = totalProducts > 0 ? Math.round((inStockCount / totalProducts) * 100) : 0;

  // Build 12-week chart from DB-aggregated weekly counts
  const now = new Date();
  const weeklyMap = new Map<string, number>();
  for (const row of (weeklyRaw as { week_start: Date; count: bigint }[])) {
    const d = new Date(row.week_start);
    const key = `${String(d.getUTCMonth()+1).padStart(2,"0")}/${String(d.getUTCDate()).padStart(2,"0")}`;
    weeklyMap.set(key, Number(row.count));
  }

  const weeklyData = Array.from({ length: 12 }, (_, i) => {
    const ws = new Date(now);
    ws.setUTCDate(ws.getUTCDate() - (11 - i) * 7);
    ws.setUTCHours(0, 0, 0, 0);
    // Align to Monday (week start)
    const day = ws.getUTCDay();
    ws.setUTCDate(ws.getUTCDate() - (day === 0 ? 6 : day - 1));
    const key = `${String(ws.getUTCMonth()+1).padStart(2,"0")}/${String(ws.getUTCDate()).padStart(2,"0")}`;
    return { week: key, products: weeklyMap.get(key) ?? 0 };
  });

  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="app-shell ">
      <Sidebar currentPath="/dashboard" orgName={orgName} role={role} locale={locale}
        alertBell={<AlertBell initialCount={unreadCount} />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />

      <div className="content-wrap">
        {/* Topbar */}
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Dashboard</span>
          <div className="topbar-right">
            <span className="tag-mono">{today}</span>
            {orgName && <span className="tag-mono">{orgName}</span>}
            <Link href="/add-product" className="btn-accent">+ Add Product</Link>
          </div>
        </div>

        {/* Page main */}
        <div className="page-main">
          {/* Main content */}
          <div className="page-content">
            {/* Stat grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", borderBottom: "1px solid var(--border-dim)" }}>
              {[
                { label: "Total SKUs",   value: totalProducts.toLocaleString(),      color: "var(--accent)" },
                { label: "Total Value",  value: formatCurrency(totalValue, locale),  color: "var(--text-1)" },
                { label: "Low Stock",    value: String(lowStock),                    color: lowStock > 0 ? "var(--red)" : "var(--text-1)" },
                { label: "Out of Stock", value: String(outOfStockCount),             color: outOfStockCount > 0 ? "var(--amber)" : "var(--text-1)" },
                { label: "In Stock %",   value: `${inStockPct}%`,                   color: "var(--accent)" },
              ].map((s, i) => (
                <TiltCard key={i} intensity={8} style={{
                  padding: "14px 16px",
                  borderRight: i < 4 ? "1px solid var(--border-dim)" : "none",
                }}>
                  <div className="metric-label">{s.label}</div>
                  <div className="metric-value" style={{ fontSize: 20, color: s.color }}>{s.value}</div>
                </TiltCard>
              ))}
            </div>
            {/* Digest card — MANAGER/SUPER_ADMIN + PRO/ENTERPRISE only */}
            {canUseDigest && (role === "MANAGER" || role === "SUPER_ADMIN") && (
              <Suspense fallback={null}>
                <DigestCard organizationId={organizationId} />
              </Suspense>
            )}

            {/* Chart */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-dim)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>New Products</div>
                  <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, fontFamily: "var(--font-mono)" }}>12-week trend</div>
                </div>
                <span className="tag-mono">{weeklyData.reduce((s, w) => s + w.products, 0)} total</span>
              </div>
              <div style={{ height: 120 }}>
                <ProductsChart data={weeklyData} role={role} />
              </div>
            </div>

            {/* Recent products table */}
            <div style={{ flex: 1, overflow: "auto" }}>
              <table className="data-table" style={{ tableLayout: "fixed", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ width: "35%" }}>Product</th>
                    <th style={{ textAlign: "right", width: "12%" }}>Stock</th>
                    <th style={{ textAlign: "right", width: "12%" }}>Threshold</th>
                    <th style={{ textAlign: "right", width: "20%" }}>Value</th>
                    <th style={{ width: "21%" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-3)", padding: "32px" }}>No products yet</td></tr>
                  ) : recent.map((p) => {
                    const isOut = p.quantity === 0;
                    const isLow = !isOut && p.quantity <= (p.lowStockAt ?? 5);
                    const statusCls = isOut ? "fill-low" : isLow ? "fill-warn" : "fill-ok";
                    const dotColor = isOut ? "var(--red)" : isLow ? "var(--amber)" : "var(--accent)";
                    const pct = p.lowStockAt ? Math.min(100, Math.round((p.quantity / (p.lowStockAt * 2)) * 100)) : 50;
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{p.name}</div>
                          {p.sku && <div className="mono text-3" style={{ fontSize: 10, marginTop: 2 }}>{p.sku}</div>}
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>{p.quantity}</td>
                        <td className="mono text-3" style={{ textAlign: "right" }}>{p.lowStockAt ?? "—"}</td>
                        <td className="mono" style={{ textAlign: "right" }}>${(Number(p.price) * p.quantity).toLocaleString()}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="dot-status" style={{ background: dotColor }} />
                            <div className="stock-track">
                              <div className={`stock-fill ${statusCls}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
