import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext, requireRole } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getCached, invalidateCache, TTL } from "@/lib/redis";
import { deleteOrganization, updateOrgCurrency } from "@/lib/actions/org";
import { SUPPORTED_CURRENCIES } from "@/lib/i18n/currency";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import BillingStatus from "@/components/billing-status";
import type { Plan } from "@/lib/billing";

const CURRENCY_LABELS: Record<string, string> = {
  MNT: "MNT — Mongolian Tögrög (₮)",
  USD: "USD — US Dollar ($)",
  EUR: "EUR — Euro (€)",
  CNY: "CNY — Chinese Yuan (¥)",
  JPY: "JPY — Japanese Yen (¥)",
  KRW: "KRW — South Korean Won (₩)",
  GBP: "GBP — British Pound (£)",
};

export default async function OrgSettingsPage() {
  const ctx = await getOrgContext();
  requireRole(ctx, "MANAGER");

  const org = await getCached(
    `org:${ctx.organizationId}:settings`,
    () => prisma.organization.findUnique({ where: { id: ctx.organizationId } }),
    TTL.MEDIUM
  );

  if (!org) return <div>Organization not found.</div>;

  async function updateOrgName(formData: FormData): Promise<void> {
    "use server";
    const innerCtx = await getOrgContext();
    requireRole(innerCtx, "MANAGER");
    const nameResult = z.string().trim().min(1).max(100).safeParse(formData.get("name"));
    if (!nameResult.success) return;
    await prisma.organization.update({
      where: { id: innerCtx.organizationId },
      data: { name: nameResult.data },
    });
    void invalidateCache([`org:${innerCtx.organizationId}:settings`]).catch(() => {});
    revalidatePath("/org/settings");
  }

  return (
    <div className="app-shell">
      <Sidebar currentPath="/org/settings" orgName={ctx.orgName ?? org.name} role={ctx.role} locale={ctx.locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Org Settings</span>
        </div>
        <div className="page-main">
          <div className="page-content" style={{ padding: "20px", gap: "16px", display: "flex", flexDirection: "column" }}>

            {/* Org Name */}
            <div className="card" style={{ padding: "20px", maxWidth: "480px" }}>
              <div className="section-header" style={{ margin: "-20px -20px 16px", borderRadius: "7px 7px 0 0" }}>Organization Name</div>
              <form action={updateOrgName} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    name="name"
                    defaultValue={org.name}
                    required
                    maxLength={100}
                    className="input-field"
                  />
                </div>
                <button type="submit" className="btn-accent" style={{ alignSelf: "flex-start" }}>
                  Save Changes
                </button>
              </form>
            </div>

            {/* Org Info */}
            <div className="card" style={{ padding: "20px", maxWidth: "480px" }}>
              <div className="section-header" style={{ margin: "-20px -20px 16px", borderRadius: "7px 7px 0 0" }}>Organization Info</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-2">Organization ID</span>
                  <span className="mono text-accent" style={{ fontSize: "11px" }}>{org.id}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-2">Created</span>
                  <span className="text-1">{new Date(org.createdAt).toLocaleDateString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-2">Your Role</span>
                  <span className="badge badge-ok">{ctx.role}</span>
                </div>
              </div>
            </div>

            {/* Display Currency */}
            <div className="card" style={{ padding: "20px", maxWidth: "480px" }}>
              <div className="section-header" style={{ margin: "-20px -20px 16px", borderRadius: "7px 7px 0 0" }}>Display Currency</div>
              <form action={async (formData: FormData) => { "use server"; await updateOrgCurrency(formData); }} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label className="form-label">Currency</label>
                  <select
                    name="currency"
                    defaultValue={org.currency}
                    className="input-field"
                  >
                    {SUPPORTED_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {/* eslint-disable-next-line security/detect-object-injection */}
                        {CURRENCY_LABELS[code]}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-accent" style={{ alignSelf: "flex-start" }}>
                  Save Currency
                </button>
              </form>
            </div>

            {/* Billing */}
            <div style={{ maxWidth: "480px" }}>
              <BillingStatus
                plan={(org.plan ?? "STARTER") as Plan}
                stripeSubscriptionStatus={
                  typeof org.stripeSubscriptionStatus === "string"
                    ? org.stripeSubscriptionStatus
                    : null
                }
                planExpiresAt={
                  org.planExpiresAt instanceof Date
                    ? org.planExpiresAt
                    : null
                }
                isManager={true}
              />
            </div>

            {/* Danger Zone */}
            <div className="card" style={{ padding: "20px", maxWidth: "480px", border: "1px solid rgba(255,68,68,0.3)" }}>
              <div className="section-header" style={{ margin: "-20px -20px 16px", borderRadius: "7px 7px 0 0", color: "var(--red)", borderColor: "rgba(255,68,68,0.2)" }}>
                Danger Zone
              </div>
              <p className="text-2" style={{ fontSize: "12px", marginBottom: "14px" }}>
                Deleting the organization will permanently remove all members, products, and data. This cannot be undone.
              </p>
              <form action={async () => { "use server"; await deleteOrganization(); }}>
                <button
                  type="submit"
                  className="btn-ghost"
                  style={{ color: "var(--red)", borderColor: "rgba(255,68,68,0.3)" }}
                >
                  Delete Organization
                </button>
              </form>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
