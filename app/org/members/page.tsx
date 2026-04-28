import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext, hasRole } from "@/lib/org";
import { getMembers, inviteMember, removeMemberRequest } from "@/lib/actions/org";
import { getPendingRequests, approveMembershipRequest, rejectMembershipRequest } from "@/lib/actions/membership";
import { revalidatePath } from "next/cache";

const actionLabels: Record<string, string> = {
  ADD: "Add Member",
  REMOVE: "Remove Member",
  UPDATE_ROLE: "Update Role",
};

export default async function MembersPage() {
  const ctx = await getOrgContext();
  const { role, orgName } = ctx;
  const isManager = hasRole(ctx, "MANAGER");

  const [members, pendingRequests] = await Promise.all([
    getMembers(),
    isManager ? getPendingRequests() : Promise.resolve([]),
  ]);

  return (
    <div className="app-shell">
      <Sidebar currentPath="/org/members" orgName={orgName} role={role} locale={ctx.locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Members</span>
          {isManager && (
            <div className="topbar-right">
              <form style={{ display: "flex", gap: "6px" }} action={async (formData: FormData) => {
                "use server";
                await inviteMember(formData);
                revalidatePath("/org/members");
              }}>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="colleague@company.com"
                  className="input-field"
                  style={{ width: "220px" }}
                />
                <button type="submit" className="btn-accent">Invite</button>
              </form>
            </div>
          )}
        </div>
        <div className="page-main">
          <div className="page-content">

            {/* ── Members table ── */}
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  {isManager && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const roleBadge =
                    member.role === "MANAGER" ? "badge-ok" :
                    member.role === "SUPER_ADMIN" ? "badge-warn" :
                    "badge-info";
                  return (
                    <tr key={member.id}>
                      <td className="text-1" style={{ fontWeight: 500 }}>{member.displayName ?? "—"}</td>
                      <td className="text-2">{member.email ?? "—"}</td>
                      <td>
                        <span className={`badge ${roleBadge}`}>{member.role}</span>
                      </td>
                      <td className="text-2">{new Date(member.createdAt).toLocaleDateString()}</td>
                      {isManager && (
                        <td>
                          {member.userId !== ctx.userId && (
                            <form action={async () => {
                              "use server";
                              await removeMemberRequest(member.userId);
                              revalidatePath("/org/members");
                            }}>
                              <button
                                type="submit"
                                className="btn-ghost"
                                style={{ fontSize: "11px", padding: "3px 10px", color: "var(--red)", borderColor: "rgba(255,68,68,0.25)" }}
                              >
                                Request Remove
                              </button>
                            </form>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={isManager ? 5 : 4} style={{ textAlign: "center", color: "var(--text-3)", padding: "48px 16px" }}>
                      No members found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* ── Approval Queue (manager only) ── */}
            {isManager && (
              <div style={{ marginTop: "32px" }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border-dim)",
                  borderTop: "1px solid var(--border-dim)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{
                      fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: "var(--text-3)",
                    }}>
                      Approval Queue
                    </span>
                    {pendingRequests.length > 0 && (
                      <span style={{
                        fontSize: "10px", fontFamily: "var(--font-mono)",
                        background: "var(--accent-dim)", color: "var(--accent)",
                        border: "1px solid var(--accent-mid)",
                        borderRadius: "4px", padding: "1px 6px",
                      }}>
                        {pendingRequests.length}
                      </span>
                    )}
                  </div>
                </div>

                {pendingRequests.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-3)", fontSize: "12px" }}>
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
                      {pendingRequests.map((req) => {
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
                                <form action={async () => {
                                  "use server";
                                  await approveMembershipRequest(req.id);
                                  revalidatePath("/org/members");
                                }}>
                                  <button type="submit" className="btn-accent" style={{ fontSize: "11px", padding: "4px 10px" }}>
                                    Approve
                                  </button>
                                </form>
                                <form action={async () => {
                                  "use server";
                                  await rejectMembershipRequest(req.id);
                                  revalidatePath("/org/members");
                                }}>
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
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
