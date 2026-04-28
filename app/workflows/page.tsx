import { getOrgContext, hasRole } from "@/lib/org";
import { listWorkflowRules } from "@/lib/actions/ai/workflows";
import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import WorkflowsClient from "./client";

export default async function WorkflowsPage() {
  // Parallel: getOrgContext (cached in Redis) + listWorkflowRules start simultaneously
  const [ctx, rules] = await Promise.all([
    getOrgContext(),
    listWorkflowRules(),
  ]);
  const { role, orgName = "", locale } = ctx;

  if (!hasRole(ctx, "MANAGER")) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 48 }}>🚫</span>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>403 — Forbidden</div>
        <div style={{ fontSize: 12, color: "var(--text-2)" }}>Manager or higher role required to access Workflows.</div>
      </div>
    );
  }

  type RuleWithRuns = typeof rules[number] & {
    runs: {
      id: string;
      triggeredAt: Date;
      conditionResult: string;
      actionType: string;
      status: string;
      errorMessage: string | null;
    }[];
  };

  const initialRules = (rules as unknown as RuleWithRuns[]).map((r) => ({
    id: r.id,
    name: r.name,
    triggerType: r.triggerType as string,
    triggerConfig: r.triggerConfig as Record<string, unknown>,
    conditionExpr: r.conditionExpr ?? null,
    actionType: r.actionType as string,
    actionConfig: r.actionConfig as Record<string, unknown>,
    enabled: r.enabled,
    createdAt: r.createdAt.toISOString(),
    runs: r.runs.map((run) => ({
      id: run.id,
      triggeredAt: run.triggeredAt.toISOString(),
      conditionResult: run.conditionResult as string,
      actionType: run.actionType as string,
      status: run.status as string,
      errorMessage: run.errorMessage ?? null,
    })),
  }));

  return (
    <div className="app-shell">
      <Sidebar
        currentPath="/workflows"
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
          <span className="topbar-page">Workflows</span>
        </div>
        <div className="page-main">
          <div className="page-content">
            <WorkflowsClient initialRules={initialRules} />
          </div>
        </div>
      </div>
    </div>
  );
}
