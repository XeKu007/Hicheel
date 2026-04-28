import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import Pagination from "@/components/pagination";
import ExportButton from "@/components/export-button";
import { getOrgContext } from "@/lib/org";
import { getAlerts, dismissAlert, dismissAllAlerts } from "@/lib/actions/alerts";
import { getTranslations } from "@/lib/i18n/index";

const PAGE_SIZE = 20;

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const [ctx, params] = await Promise.all([getOrgContext(), searchParams]);
  const t = getTranslations(ctx.locale);
  const isManager = ctx.role === "MANAGER" || ctx.role === "SUPER_ADMIN";

  const page = Math.min(500, Math.max(1, Number(params.page ?? 1)));

  const { alerts, total } = await getAlerts(page, ctx);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="app-shell">
      <Sidebar currentPath="/alerts" orgName={ctx.orgName} role={ctx.role} locale={ctx.locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">{t.alerts.title}</span>
          <div className="topbar-right">
            <ExportButton isManager={isManager} />
            {alerts.some((a) => a.status === "UNREAD") && (
              <form action={async () => {
                "use server";
                await dismissAllAlerts();
                const { revalidatePath } = await import("next/cache");
                revalidatePath("/alerts");
              }}>
                <button type="submit" className="btn-ghost">{t.alerts.dismissAll}</button>
              </form>
            )}
          </div>
        </div>
        <div className="page-main">
          <div className="page-content">
            {alerts.length === 0 ? (
              <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--text-3)", fontSize: "12px" }}>
                {t.alerts.noAlerts}
              </div>
            ) : (
              <>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.alerts.type}</th>
                      <th>{t.alerts.productName}</th>
                      <th>{t.alerts.quantity}</th>
                      <th>{t.alerts.status}</th>
                      <th>{t.alerts.createdAt}</th>
                      <th>{t.alerts.dismiss}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert) => {
                      let quantityDisplay = "—";
                      if (alert.type === "LOW_STOCK" && alert.currentQty !== null && alert.currentQty !== undefined) {
                        quantityDisplay = alert.lowStockAt !== null && alert.lowStockAt !== undefined
                          ? `${alert.currentQty} / ${alert.lowStockAt} (${t.alerts.threshold})`
                          : String(alert.currentQty);
                      } else if (alert.type === "ANOMALY" && alert.previousQty !== null && alert.newQty !== null &&
                          alert.previousQty !== undefined && alert.newQty !== undefined) {
                        quantityDisplay = alert.percentageDrop !== null && alert.percentageDrop !== undefined
                          ? `${alert.previousQty} → ${alert.newQty} (${alert.percentageDrop.toFixed(1)}%)`
                          : `${alert.previousQty} → ${alert.newQty}`;
                      }
                      return (
                        <tr key={alert.id}>
                          <td>
                            <span className={`badge ${alert.type === "LOW_STOCK" ? "badge-warn" : "badge-low"}`}>
                              {alert.type === "LOW_STOCK" ? t.alerts.lowStock : t.alerts.anomaly}
                            </span>
                          </td>
                          <td className="text-1">{alert.productName}</td>
                          <td className="mono text-2" style={{ fontSize: "11px" }}>{quantityDisplay}</td>
                          <td>
                            <span className={`badge ${alert.status === "UNREAD" ? "badge-ok" : "badge-info"}`}>
                              {alert.status === "UNREAD" ? t.alerts.unread : t.alerts.dismissed}
                            </span>
                          </td>
                          <td className="text-2">{new Date(alert.createdAt).toLocaleDateString()}</td>
                          <td>
                            {alert.status === "UNREAD" && (
                              <form action={async () => {
                                "use server";
                                const result = await dismissAlert(alert.id);
                                const { revalidatePath } = await import("next/cache");
                                revalidatePath("/alerts");
                                if (result.error) {
                                  // Already dismissed or not found — still revalidate
                                  console.warn("[alerts] dismissAlert:", result.error);
                                }
                              }}>
                                <button type="submit" className="btn-ghost" style={{ fontSize: "11px", padding: "3px 10px" }}>
                                  {t.alerts.dismiss}
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {totalPages > 1 && (
                  <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-dim)" }}>
                    <Pagination currentPage={page} totalPages={totalPages} baseUrl="/alerts" searchParams={{}} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
