import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getCached, TTL } from "@/lib/redis";
import { dispatchProduct } from "@/lib/actions/products";
import { ArrowUpFromLine } from "lucide-react";
import TiltCard from "@/components/tilt-card";

export default async function DispatchPage() {
  const ctx = await getOrgContext();
  const { organizationId, role, orgName = "", locale } = ctx;

  const items = await getCached(
    `org:${organizationId}:dispatch:products`,
    async () => {
      return prisma.product.findMany({
        where: { organizationId, quantity: { gt: 0 } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, sku: true, quantity: true, imageUrl: true },
      });
    },
    TTL.SHORT
  );

  return (
    <div className="app-shell">
      <Sidebar currentPath="/dispatch" orgName={orgName} role={role} locale={locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Dispatch</span>
        </div>
        <div className="page-main">
          <div className="page-content" style={{ padding: "20px" }}>
            <TiltCard intensity={6} style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border-dim)", background: "var(--bg-raised)", padding: "24px", maxWidth: "480px" }}>
              <form style={{ display: "flex", flexDirection: "column", gap: "14px" }} action={dispatchProduct}>
                <div>
                  <label className="form-label">Product <span style={{ color: "var(--red)" }}>*</span></label>
                  <select name="productId" required className="input-field">
                    <option value="">Select a product...</option>
                    {items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.sku ? `(${p.sku})` : ""} — {p.quantity} in stock
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Quantity to dispatch <span style={{ color: "var(--red)" }}>*</span></label>
                  <input type="number" name="quantity" min="1" required className="input-field" placeholder="0" />
                </div>

                <div>
                  <label className="form-label">Reason <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                  <input type="text" name="reason" className="input-field" placeholder="e.g. Sold, Damaged, Transferred..." />
                </div>
                <button type="submit" className="btn-accent" style={{ width: "100%", justifyContent: "center", padding: "8px", marginTop: "4px" }}>
                  <ArrowUpFromLine style={{ width: "13px", height: "13px" }} />
                  Dispatch
                </button>
              </form>
            </TiltCard>
          </div>
        </div>
      </div>
    </div>
  );
}
