import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext, requireRole } from "@/lib/org";
import { getAuditLogs } from "@/lib/actions/audit";
import type { AuditActionType, AuditEntityType } from "@/lib/actions/audit";
import { getOrgPlan, hasFeature } from "@/lib/billing";
import Link from "next/link";

const ACTION_BADGE: Record<AuditActionType, string> = {
  CREATE: "badge-ok",
  UPDATE: "badge-info",
  DELETE: "badge-low",
  ROLE_CHANGE: "badge-warn",
  MEMBERSHIP: "badge-warn",
};

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    actorMemberId?: string;
    actionType?: string;
    entityType?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  const [ctx, params] = await Promise.all([getOrgContext(), searchParams]);
  requireRole(ctx, "MANAGER");

  const plan = await getOrgPlan(ctx.organizationId);
  if (!hasFeature(plan, "auditLog")) {
    return (
      <div className="app-shell">
        <Sidebar currentPath="/org/audit" orgName={ctx.orgName} role={ctx.role} locale={ctx.locale}
          alertBell={<AlertBell />}
          userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
        <div className="content-wrap">
          <div className="topbar">
            <span className="topbar-brand">StockFlow</span>
            <span className="topbar-sep">/</span>
            <span className="topbar-page">Audit Log</span>
          </div>
          <div className="page-main">
            <div className="page-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 40 }}>🔒</span>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>Pro feature</div>
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>Upgrade to Pro to access the Audit Log.</div>
              <Link href="/pricing" className="btn-accent" style={{ marginTop: 8 }}>Upgrade to Pro</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { entries, nextCursor } = await getAuditLogs({
    cursor: params.cursor,
    actorMemberId: params.actorMemberId,
    actionType: params.actionType as AuditActionType | undefined,
    entityType: params.entityType as AuditEntityType | undefined,
    dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
    dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
  });

  const nextParams = new URLSearchParams({
    ...(params.actorMemberId ? { actorMemberId: params.actorMemberId } : {}),
    ...(params.actionType ? { actionType: params.actionType } : {}),
    ...(params.entityType ? { entityType: params.entityType } : {}),
    ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
    ...(params.dateTo ? { dateTo: params.dateTo } : {}),
    ...(nextCursor ? { cursor: nextCursor } : {}),
  });

  return (
    <div className="app-shell">
      <Sidebar currentPath="/org/audit" orgName={ctx.orgName} role={ctx.role} locale={ctx.locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Audit Log</span>
        </div>
        <div className="page-main">
          <div className="page-content">
            {/* Filters */}
            <form method="GET" style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--border-dim)", flexWrap: "wrap" }}>
              <select name="actionType" defaultValue={params.actionType ?? ""} className="input-field" style={{ width: 140 }}>
                <option value="">All Actions</option>
                {(["CREATE","UPDATE","DELETE","ROLE_CHANGE","MEMBERSHIP"] as AuditActionType[]).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select name="entityType" defaultValue={params.entityType ?? ""} className="input-field" style={{ width: 140 }}>
                <option value="">All Entities</option>
                {(["Product","Member","Invitation"] as AuditEntityType[]).map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <input type="date" name="dateFrom" defaultValue={params.dateFrom ?? ""} className="input-field" style={{ width: 140 }} />
              <input type="date" name="dateTo" defaultValue={params.dateTo ?? ""} className="input-field" style={{ width: 140 }} />
              <button type="submit" className="btn-ghost">Filter</button>
              <Link href="/org/audit" className="btn-ghost">Clear</Link>
            </form>

            {/* Table */}
            {entries.length === 0 ? (
              <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
                No audit log entries found.
              </div>
            ) : (
              <>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Changes</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: "50%",
                              background: "var(--accent-dim)", border: "1px solid var(--accent-mid)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 700, color: "var(--accent)", flexShrink: 0,
                            }}>
                              {(entry.actorDisplayName || entry.actorMemberId).charAt(0).toUpperCase()}
                            </div>
                            <span className="text-2" style={{ fontSize: 11 }}>
                              {entry.actorDisplayName || entry.actorMemberId.slice(0, 8)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${ACTION_BADGE[entry.actionType]}`}>
                            {entry.actionType}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 12 }}>{entry.entityName}</div>
                          <div className="text-3 mono" style={{ fontSize: 10 }}>{entry.entityType}</div>
                        </td>
                        <td style={{ maxWidth: 280 }}>
                          {entry.before || entry.after ? (
                            <div className="mono text-2" style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {entry.after
                                ? Object.entries(entry.after as Record<string, unknown>)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(", ")
                                : "deleted"}
                            </div>
                          ) : <span className="text-3">—</span>}
                        </td>
                        <td className="text-3" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                          {relativeTime(entry.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {nextCursor && (
                  <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-dim)" }}>
                    <Link href={`/org/audit?${nextParams}`} className="btn-ghost">
                      Load more
                    </Link>
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
