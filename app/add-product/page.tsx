import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getCached, TTL } from "@/lib/redis";
import AddProductClient from "./client";
import { dispatchProduct } from "@/lib/actions/products";
import { ArrowUpFromLine } from "lucide-react";
import TiltCard from "@/components/tilt-card";

export default async function AddProductPage() {
  const ctx = await getOrgContext();

  const [categories, dispatchItems] = await Promise.all([
    getCached(
      `org:${ctx.organizationId}:categories`,
      async () => {
        const rows = await prisma.product.groupBy({
          by: ["category"],
          where: { organizationId: ctx.organizationId, category: { not: null } },
          orderBy: { category: "asc" },
        });
        return rows.map(r => r.category as string);
      },
      TTL.MEDIUM
    ),
    getCached(
      `org:${ctx.organizationId}:dispatch:products`,
      () => prisma.product.findMany({
        where: { organizationId: ctx.organizationId, quantity: { gt: 0 } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, sku: true, quantity: true },
      }),
      TTL.SHORT
    ),
  ]);

  return (
    <div className="app-shell">
      <Sidebar currentPath="/add-product" orgName={ctx.orgName} role={ctx.role} locale={ctx.locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Add Product</span>
        </div>
        <div className="page-main">
          <div className="page-content" style={{ padding: "20px" }}>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>

              {/* ── Add Product form ── */}
              <AddProductClient existingCategories={categories} />

              {/* ── Dispatch form ── */}
              <div style={{ flex: "0 0 auto", width: "100%", maxWidth: "480px" }}>
                <div style={{
                  fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: "var(--text-3)",
                  marginBottom: "12px",
                }}>
                  Dispatch Product
                </div>
                <TiltCard intensity={6} style={{
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border-dim)",
                  background: "var(--bg-raised)",
                  padding: "24px",
                }}>
                  {dispatchItems.length === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: "12px", padding: "24px 0" }}>
                      No products in stock to dispatch
                    </div>
                  ) : (
                    <form style={{ display: "flex", flexDirection: "column", gap: "14px" }} action={dispatchProduct}>
                      <div>
                        <label className="form-label">Product <span style={{ color: "var(--red)" }}>*</span></label>
                        <select name="productId" required className="input-field">
                          <option value="">Select a product...</option>
                          {dispatchItems.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}{p.sku ? ` (${p.sku})` : ""} — {p.quantity} in stock
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label">Quantity <span style={{ color: "var(--red)" }}>*</span></label>
                        <input type="number" name="quantity" min="1" required className="input-field" placeholder="0" />
                      </div>
                      <div>
                        <label className="form-label">
                          Reason{" "}
                          <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                        </label>
                        <input type="text" name="reason" className="input-field" placeholder="e.g. Sold, Damaged, Transferred..." />
                      </div>
                      <button
                        type="submit"
                        className="btn-accent"
                        style={{ width: "100%", justifyContent: "center", padding: "8px", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <ArrowUpFromLine style={{ width: "13px", height: "13px" }} />
                        Dispatch
                      </button>
                    </form>
                  )}
                </TiltCard>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
