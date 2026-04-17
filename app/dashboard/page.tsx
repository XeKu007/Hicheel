import ProductsChart from "@/components/products-chart";
import Sidebar from "@/components/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCached } from "@/lib/redis";
import { TrendingUp } from "lucide-react";

const cardStyle = {
  background: "rgba(13,13,26,0.8)",
  border: "1px solid rgba(56,189,248,0.15)",
  borderRadius: "12px",
};

async function getDashboardData(userId: string) {
  return getCached(
    `dashboard:${userId}`,
    async () => {
      const twelveWeeksAgo = new Date();
      twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

      const [totalProducts, lowStock, allProducts, recent, weeklyRaw] =
        await Promise.all([
          prisma.product.count({ where: { userId } }),
          prisma.product.count({
            where: { userId, lowStockAt: { not: null }, quantity: { lte: 5 } },
          }),
          // Only fetch fields needed for calculations
          prisma.product.findMany({
            where: { userId },
            select: { price: true, quantity: true, lowStockAt: true },
          }),
          prisma.product.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, name: true, quantity: true, lowStockAt: true },
          }),
          // Only fetch last 12 weeks for chart
          prisma.product.findMany({
            where: { userId, createdAt: { gte: twelveWeeksAgo } },
            select: { createdAt: true },
          }),
        ]);

      return { totalProducts, lowStock, allProducts, recent, weeklyRaw };
    },
    60
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const userId = user.id;

  const { totalProducts, lowStock, allProducts, recent, weeklyRaw } =
    await getDashboardData(userId);

  const totalValue = allProducts.reduce(
    (sum, p) => sum + Number(p.price) * Number(p.quantity),
    0
  );

  const inStockCount = allProducts.filter((p) => Number(p.quantity) > 5).length;
  const lowStockCount = allProducts.filter((p) => Number(p.quantity) <= 5 && Number(p.quantity) >= 1).length;
  const outOfStockCount = allProducts.filter((p) => Number(p.quantity) === 0).length;

  const inStockPercentage = totalProducts > 0 ? Math.round((inStockCount / totalProducts) * 100) : 0;
  const lowStockPercentage = totalProducts > 0 ? Math.round((lowStockCount / totalProducts) * 100) : 0;
  const outOfStockPercentage = totalProducts > 0 ? Math.round((outOfStockCount / totalProducts) * 100) : 0;

  const now = new Date();
  const weeklyProductsData = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - i * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    const weekLabel = `${String(weekStart.getMonth() + 1).padStart(2, "0")}/${String(weekStart.getDate()).padStart(2, "0")}`;
    const count = weeklyRaw.filter((p) => {
      const d = new Date(p.createdAt);
      return d >= weekStart && d <= weekEnd;
    }).length;
    weeklyProductsData.push({ week: weekLabel, products: count });
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f" }}>
      <Sidebar currentPath="/dashboard" />
      <main className="ml-64 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "#e2e8f0" }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(226,232,240,0.5)" }}>
            Welcome back! Here is an overview of your inventory.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8">
          {[
            { label: "Total Products", value: totalProducts },
            { label: "Total Value", value: `$${totalValue.toFixed(0)}` },
            { label: "Low Stock", value: lowStock },
          ].map((m, i) => (
            <div key={i} style={cardStyle} className="p-6">
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "rgba(56,189,248,0.6)" }}>{m.label}</div>
              <div className="text-3xl font-bold" style={{ color: "#e2e8f0" }}>{m.value}</div>
              <div className="flex items-center mt-2 gap-1">
                <TrendingUp className="w-3 h-3" style={{ color: "#38bdf8" }} />
                <span className="text-xs" style={{ color: "#38bdf8" }}>Active</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div style={cardStyle} className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest mb-6" style={{ color: "rgba(56,189,248,0.7)" }}>
              New Products Per Week
            </h2>
            <div className="h-48">
              <ProductsChart data={weeklyProductsData} />
            </div>
          </div>

          <div style={cardStyle} className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest mb-6" style={{ color: "rgba(56,189,248,0.7)" }}>
              Stock Efficiency
            </h2>
            <div className="flex items-center justify-center mb-4">
              <div className="relative w-36 h-36">
                <div className="absolute inset-0 rounded-full" style={{ border: "8px solid rgba(56,189,248,0.1)" }} />
                <div className="absolute inset-0 rounded-full" style={{ border: "8px solid #38bdf8", clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.sin(2 * Math.PI * inStockPercentage / 100)}% ${50 - 50 * Math.cos(2 * Math.PI * inStockPercentage / 100)}%, 100% 0%, 100% 100%, 0% 100%, 0% 0%)` }} />
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <div className="text-2xl font-bold" style={{ color: "#38bdf8" }}>{inStockPercentage}%</div>
                  <div className="text-xs" style={{ color: "rgba(226,232,240,0.5)" }}>In Stock</div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: "In Stock", pct: inStockPercentage, color: "#38bdf8" },
                { label: "Low Stock", pct: lowStockPercentage, color: "#a855f7" },
                { label: "Out of Stock", pct: outOfStockPercentage, color: "rgba(226,232,240,0.2)" },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                    <span style={{ color: "rgba(226,232,240,0.6)" }}>{s.label}</span>
                  </div>
                  <span style={{ color: s.color }}>{s.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={cardStyle} className="p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-6" style={{ color: "rgba(56,189,248,0.7)" }}>
            Recent Stock Levels
          </h2>
          <div className="space-y-3">
            {recent.map((product, key) => {
              const stockLevel = product.quantity === 0 ? 0 : product.quantity <= (product.lowStockAt || 5) ? 1 : 2;
              const colors = ["#ef4444", "#f59e0b", "#38bdf8"];
              return (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: "rgba(56,189,248,0.04)", border: "1px solid rgba(56,189,248,0.08)" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: colors[stockLevel], boxShadow: `0 0 6px ${colors[stockLevel]}` }} />
                    <span className="text-sm font-medium" style={{ color: "#e2e8f0" }}>{product.name}</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: colors[stockLevel] }}>{product.quantity} units</span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
