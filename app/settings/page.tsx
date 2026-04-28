import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext } from "@/lib/org";
import { AccountSettings } from "@stackframe/stack";

export default async function SettingsPage() {
  const ctx = await getOrgContext();
  return (
    <div className="app-shell">
      <Sidebar currentPath="/settings" orgName={ctx.orgName} role={ctx.role} locale={ctx.locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Settings</span>
        </div>
        <div className="page-main">
          <div className="page-content" style={{ padding: "20px" }}>
            <div className="card" style={{ padding: "20px" }}>
              <AccountSettings fullPage />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
