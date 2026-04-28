import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext, requireRole } from "@/lib/org";
import GrafanaEmbed from "@/components/grafana-embed";

export default async function MonitoringPage() {
  const ctx = await getOrgContext();
  requireRole(ctx, "SUPER_ADMIN");

  return (
    <div className="app-shell">
      <Sidebar currentPath="/admin/monitoring" orgName={ctx.orgName} role={ctx.role} locale={ctx.locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Monitoring</span>
          <div className="topbar-right">
            <span className="tag-mono">SUPER_ADMIN</span>
          </div>
        </div>
        <div className="page-main">
          <div className="page-content" style={{ padding: 0 }}>
            <div style={{ flex: 1, height: "100%" }}>
              <GrafanaEmbed />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
