import { redis } from "@/lib/redis";
import type { DigestReport } from "@/app/api/digest/run/route";
import { formatCurrencyByCode, type CurrencyCode, SUPPORTED_CURRENCIES } from "@/lib/i18n/currency";

interface DigestCardProps {
  organizationId: string;
}

export default async function DigestCard({ organizationId }: DigestCardProps) {
  let report: DigestReport | null = null;
  try {
    report = await redis.get<DigestReport>(`org:${organizationId}:digest:latest`);
  } catch {}

  if (!report) {
    return (
      <div style={{
        padding: "16px 20px", borderBottom: "1px solid var(--border-dim)",
        background: "rgba(255,255,255,0.01)",
      }}>
        <div className="metric-label" style={{ marginBottom: 8 }}>Yesterday&apos;s Summary</div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>No digest available yet.</div>
      </div>
    );
  }

  const currency = SUPPORTED_CURRENCIES.includes(report.currencyCode as CurrencyCode)
    ? (report.currencyCode as CurrencyCode)
    : "MNT";

  const valueStr = formatCurrencyByCode(report.totalInventoryValue, currency);

  const stats = [
    { label: "Inventory Value", value: valueStr, color: "var(--accent)" },
    { label: "New Products",    value: String(report.newProductsCount), color: "var(--text-1)" },
    { label: "Dispatches",      value: String(report.dispatchCount),    color: "var(--text-1)" },
    { label: "New Alerts",      value: String(report.newAlertsCount),   color: report.newAlertsCount > 0 ? "var(--amber)" : "var(--text-1)" },
    { label: "Dismissed",       value: String(report.dismissedAlertsCount), color: "var(--text-2)" },
  ];

  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-dim)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div className="metric-label">Yesterday&apos;s Summary</div>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
            {report.date}
          </div>
        </div>
        <span className="tag-mono">{report.currencyCode}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 1, background: "var(--border-dim)", borderRadius: "var(--r-sm)", overflow: "hidden" }}>
        {stats.map((s, i) => (
          <div key={i} style={{ padding: "10px 12px", background: "var(--bg-surface)" }}>
            <div className="metric-label" style={{ marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, color: s.color, letterSpacing: "-0.02em" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
