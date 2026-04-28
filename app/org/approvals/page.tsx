import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext, requireRole } from "@/lib/org";
import { getPendingRequests, approveMembershipRequest, rejectMembershipRequest } from "@/lib/actions/membership";

const actionLabels: Record<string, string> = {
  ADD: "Add Member",
  REMOVE: "Remove Member",
  UPDATE_ROLE: "Update Role",
};

export default async function ApprovalsPage() {
  const ctx = await getOrgContext();
  requireRole(ctx, "MANAGER");
  const requests = await getPendingRequests();

  return (
    <div className="app-shell">
      <Sidebar currentPath="/org/approvals" orgName={ctx.orgName} role={ctx.role} locale={ctx.locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Approval Queue</span>
        </div>
        <div className="page-main">
          <div className="page-content">
            {requests.length === 0 ? (
              <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--text-3)", fontSize: "12px" }}>
                No pending requests
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Requested By</th>
                    <th>New Role</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => {
                    const actionBadge =
                      req.action === "ADD" ? "badge-ok" :
                      req.action === "REMOVE" ? "badge-low" :
                      "badge-warn";
                    return (
                      <tr key={req.id}>
                        <td>
                          <span className={`badge ${actionBadge}`}>
                            {actionLabels[req.action] ?? req.action}
                          </span>
                        </td>
                        <td>
                          <div className="text-1">{req.targetName ?? "Unknown"}</div>
                          <div className="text-2" style={{ fontSize: "11px" }}>{req.targetEmail}</div>
                        </td>
                        <td>
                          <div className="text-1">{req.requesterName ?? "Unknown"}</div>
                          <div className="text-2" style={{ fontSize: "11px" }}>{req.requesterEmail}</div>
                        </td>
                        <td className="text-2">{req.newRole ?? "—"}</td>
                        <td className="text-2">{new Date(req.createdAt).toLocaleDateString()}</td>
                        <td>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <form action={async () => { "use server"; await approveMembershipRequest(req.id); }}>
                              <button type="submit" className="btn-accent" style={{ fontSize: "11px", padding: "4px 10px" }}>
                                Approve
                              </button>
                            </form>
                            <form action={async () => { "use server"; await rejectMembershipRequest(req.id); }}>
                              <button type="submit" className="btn-ghost" style={{ fontSize: "11px", padding: "3px 10px", color: "var(--red)", borderColor: "rgba(255,68,68,0.25)" }}>
                                Reject
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
