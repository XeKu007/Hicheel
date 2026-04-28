import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext, hasRole } from "@/lib/org";
import { type ReorderSuggestionResult } from "@/lib/actions/ai/reorder";
import ReorderClient from "./client";

type SuggestionWithExplanation = ReorderSuggestionResult & { explanation: string | null };

export default async function ReorderPage() {
  const ctx = await getOrgContext();
  const { organizationId, role, orgName = "", locale } = ctx;

  if (!hasRole(ctx, "MANAGER")) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 48 }}>🚫</span>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>403 — Forbidden</div>
        <div style={{ fontSize: 12, color: "var(--text-2)" }}>Manager or higher role required to access Reorder Suggestions.</div>
      </div>
    );
  }

  const cacheKey = `org:${organizationId}:reorder:page`;
  const { redis, TTL } = await import("@/lib/redis");

  let suggestionsWithExplanations = await redis.get<SuggestionWithExplanation[]>(cacheKey).catch(() => null);

  if (!suggestionsWithExplanations) {
    const { computeReorderSuggestions, generateReorderExplanation } = await import("@/lib/actions/ai/reorder");
    const suggestions = await computeReorderSuggestions(organizationId);

    // Generate all AI explanations in parallel instead of sequentially
    const withExplanations = await Promise.all(
      suggestions.map((s) =>
        generateReorderExplanation(organizationId, s.productId, s)
          .then((explanation) => ({ ...s, explanation }))
          .catch(() => ({ ...s, explanation: null }))
      )
    );
    withExplanations.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
    suggestionsWithExplanations = withExplanations;
    void redis.setex(cacheKey, TTL.LONG, JSON.stringify(withExplanations)).catch(() => {});
  }

  return (
    <div className="app-shell">
      <Sidebar
        currentPath="/reorder"
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
          <span className="topbar-page">Reorder Suggestions</span>
        </div>
        <div className="page-main">
          <div className="page-content">
            <ReorderClient suggestions={suggestionsWithExplanations} />
          </div>
        </div>
      </div>
    </div>
  );
}
