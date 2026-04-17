import Pagination from "@/components/pagination";
import Sidebar from "@/components/sidebar";
import { deleteProduct } from "@/lib/actions/products";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCached } from "@/lib/redis";

const cardStyle = {
  background: "rgba(13,13,26,0.8)",
  border: "1px solid rgba(56,189,248,0.15)",
  borderRadius: "12px",
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  const userId = user.id;

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = 10;

  const { totalCount, items } = await getCached(
    `inventory:${userId}:${q}:${page}`,
    async () => {
      const where = {
        userId,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      };
      const [totalCount, items] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return { totalCount, items };
    },
    30 // 30 секунд cache
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f" }}>
      <Sidebar currentPath="/inventory" />
      <main className="ml-64 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "#e2e8f0" }}>Inventory</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(226,232,240,0.5)" }}>
            Manage your products and track inventory levels.
          </p>
        </div>

        <div className="space-y-6">
          <div style={cardStyle} className="p-4">
            <form className="flex gap-3" action="/inventory" method="GET">
              <input
                name="q"
                defaultValue={q}
                placeholder="Search products..."
                className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
                style={{ background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.2)", color: "#e2e8f0" }}
              />
              <button
                className="px-6 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(90deg, #38bdf8, #7c3aed)", color: "white" }}
              >
                Search
              </button>
            </form>
          </div>

          <div style={{ ...cardStyle, overflow: "hidden" }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(56,189,248,0.1)" }}>
                  {["Name", "SKU", "Price", "Quantity", "Low Stock At", "Actions"].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest"
                      style={{ color: "rgba(56,189,248,0.6)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((product, key) => (
                  <tr key={key} style={{ borderBottom: "1px solid rgba(56,189,248,0.06)" }}
                    className="transition-colors hover:bg-[rgba(56,189,248,0.03)]">
                    <td className="px-6 py-4 text-sm font-medium" style={{ color: "#e2e8f0" }}>{product.name}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: "rgba(226,232,240,0.5)" }}>{product.sku || "—"}</td>
                    <td className="px-6 py-4 text-sm font-medium" style={{ color: "#38bdf8" }}>${Number(product.price).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: "#e2e8f0" }}>{product.quantity}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: "rgba(226,232,240,0.5)" }}>{product.lowStockAt || "—"}</td>
                    <td className="px-6 py-4 text-sm">
                      <form action={async (formData: FormData) => {
                        "use server";
                        await deleteProduct(formData);
                      }}>
                        <input type="hidden" name="id" value={product.id} />
                        <button className="text-xs font-semibold px-3 py-1 rounded transition-opacity hover:opacity-80"
                          style={{ color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm" style={{ color: "rgba(226,232,240,0.3)" }}>
                      No products found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={cardStyle} className="p-4">
              <Pagination currentPage={page} totalPages={totalPages} baseUrl="/inventory" searchParams={{ q, pageSize: String(pageSize) }} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
