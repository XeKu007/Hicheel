import { getOrgContext, hasRole } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getCached, TTL } from "@/lib/redis";
import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import AgentClient from "./client";

export default async function AgentPage() {
  // Parallel: getOrgContext (cached) + insights fetch start simultaneously
  const [ctx, insights] = await Promise.all([
    getOrgContext(),
    // insights fetch needs orgId — start after ctx resolves via parallel pattern
    getOrgContext().then(c => getCached(
      `org:${c.organizationId}:agent:insights`,
      () => prisma.agentInsight.findMany({
        where: { organizationId: c.organizationId, resolved: false },
        orderBy: [{ generatedAt: "desc" }],
        select: {
          id: true, insightType: true, productId: true, productName: true,
          description: true, severity: true, resolved: true,
          resolvedById: true, resolvedAt: true, generatedAt: true, organizationId: true,
        },
      }),
      TTL.SHORT
    )),
  ]);
  const { organizationId, role, orgName = "", locale } = ctx;

  if (!hasRole(ctx, "MANAGER")) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 48 }}>🚫</span>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>403 — Forbidden</div>
        <div style={{ fontSize: 12, color: "var(--text-2)" }}>Manager or higher role required to access Agent Insights.</div>
      </div>
    );
  }

  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  // Sort by severity desc then generatedAt desc
  insights.sort((a, b) => {
    const sev = severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder];
    if (sev !== 0) return sev;
    return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
  });

  return (
    <div className="app-shell">
      <Sidebar
        currentPath="/agent"
        orgName={orgName}
        role={role}
        locale={locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar}
      />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">Agent Insights</span>
        </div>
        <div className="page-main">
          <div className="page-content">
            <AgentClient insights={insights} />
          </div>
        </div>
      </div>
    </div>
  );
}
