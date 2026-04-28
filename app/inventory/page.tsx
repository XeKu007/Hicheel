import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getCached, TTL } from "@/lib/redis";
import InventoryClient from "./client";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const [ctx, params] = await Promise.all([
    getOrgContext(),
    searchParams,
  ]);
  const { organizationId, role, orgName = "", locale } = ctx;

  // Fire-and-forget tracking
  void (async () => {
    const { trackStaffAction } = await import("@/lib/gamification/actions");
    await trackStaffAction({ memberId: ctx.memberId, organizationId, type: "INVENTORY_CHECKED" });
  })();

  const q = (params.q ?? "").trim();
  const MAX_PAGE = 1000; // prevent DoS via extremely large page numbers
  const page = Math.min(MAX_PAGE, Math.max(1, Number(params.page ?? 1)));
  const pageSize = 10;

  // Fetch categories (with counts) and inventory in parallel
  const [{ totalCount, items }, categoryRows] = await Promise.all([
    getCached(
      `org:${organizationId}:inventory:${q}:${page}`,
      async () => {
        const where = {
          organizationId,
          ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
        };
        const [totalCount, items] = await Promise.all([
          prisma.product.count({ where }),
          prisma.product.findMany({
            where, orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize, take: pageSize,
          }),
        ]);
        return { totalCount, items };
      },
      TTL.SHORT
    ),
    getCached(
      `org:${organizationId}:categories:counts`,
      async () => {
        const rows = await prisma.product.groupBy({
          by: ["category"],
          where: { organizationId },
          _count: { id: true },
          orderBy: { category: "asc" },
        });
        return rows.map(r => ({
          name: r.category ?? null,
          count: r._count.id,
        }));
      },
      TTL.MEDIUM
    ),
  ]);

  // Separate uncategorized from named categories
  const categories = categoryRows
    .filter(r => r.name !== null)
    .map(r => ({ name: r.name as string, count: r.count }));
  const uncategorizedCount = categoryRows.find(r => r.name === null)?.count ?? 0;

  const initialItems = items.map(p => ({
    id: p.id, name: p.name, sku: p.sku,
    price: Number(p.price), quantity: p.quantity,
    lowStockAt: p.lowStockAt, imageUrl: p.imageUrl,
    category: p.category ?? null,
  }));

  return (
    <div className="app-shell">
      <Sidebar currentPath="/inventory" orgName={orgName} role={role} locale={locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Inventory</span>
        </div>
        <div className="page-main" style={{ overflow: "hidden" }}>
          <InventoryClient
            initialItems={initialItems}
            initialTotal={totalCount}
            initialQ={q}
            initialPage={page}
            isManager={ctx.role === "MANAGER" || ctx.role === "SUPER_ADMIN"}
            categories={categories}
            uncategorizedCount={uncategorizedCount}
          />
        </div>
      </div>
    </div>
  );
}
