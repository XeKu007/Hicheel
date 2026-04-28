import Link from "next/link";
import { CreditCard, AlertTriangle, CheckCircle, ArrowUpRight, ExternalLink } from "lucide-react";
import type { Plan } from "@/lib/billing";

interface BillingStatusProps {
  plan: Plan;
  stripeSubscriptionStatus: string | null;
  planExpiresAt: Date | null;
  isManager: boolean;
}

const PLAN_LABELS: Record<Plan, string> = {
  STARTER:    "Starter",
  PRO:        "Pro",
  ENTERPRISE: "Enterprise",
};

const PLAN_PRICES: Record<Plan, string> = {
  STARTER:    "Free",
  PRO:        "$29/mo",
  ENTERPRISE: "$100/mo",
};

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }).format(new Date(date));
}

export default function BillingStatus({
  plan,
  stripeSubscriptionStatus,
  planExpiresAt,
  isManager,
}: BillingStatusProps) {
  const isPastDue = stripeSubscriptionStatus === "past_due";
  const isPaid    = plan === "PRO" || plan === "ENTERPRISE";
  const planColor = plan === "PRO" ? "#C8F000" : plan === "ENTERPRISE" ? "#0070f6" : "rgba(255,255,255,0.3)";
  // Explicit lookups to avoid dynamic key access
  const planLabel = plan === "PRO" ? PLAN_LABELS.PRO : plan === "ENTERPRISE" ? PLAN_LABELS.ENTERPRISE : PLAN_LABELS.STARTER;
  const planPrice = plan === "PRO" ? PLAN_PRICES.PRO : plan === "ENTERPRISE" ? PLAN_PRICES.ENTERPRISE : PLAN_PRICES.STARTER;

  return (
    <div className="card" style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <CreditCard size={14} style={{ color: "var(--text-3)" }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
          Billing
        </span>
      </div>

      {/* Past-due warning */}
      {isPastDue && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "12px 14px", marginBottom: 16,
          background: "rgba(255,68,68,0.08)",
          border: "1px solid rgba(255,68,68,0.2)",
          borderRadius: "var(--r-sm)",
        }}>
          <AlertTriangle size={13} style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--red)", marginBottom: 3 }}>
              Payment failed
            </div>
            <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.6 }}>
              Your last payment didn&apos;t go through. Update your payment method to keep your plan active.
            </div>
          </div>
        </div>
      )}

      {/* Plan info row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Plan badge */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 99,
            background: isPaid ? `${planColor}14` : "var(--bg-raised)",
            border: `1px solid ${isPaid ? `${planColor}30` : "var(--border-dim)"}`,
            fontSize: 11, fontWeight: 700,
            color: isPaid ? planColor : "var(--text-2)",
          }}>
            {isPaid && <CheckCircle size={10} />}
            {planLabel}
          </span>

          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            {planPrice}
          </span>
        </div>

        {/* Status pill */}
        {stripeSubscriptionStatus && (
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
            padding: "2px 8px", borderRadius: 99,
            background: isPastDue
              ? "rgba(255,68,68,0.1)"
              : stripeSubscriptionStatus === "active"
                ? "rgba(200,240,0,0.08)"
                : "var(--bg-raised)",
            color: isPastDue
              ? "var(--red)"
              : stripeSubscriptionStatus === "active"
                ? "var(--accent)"
                : "var(--text-3)",
          }}>
            {stripeSubscriptionStatus.replace("_", " ").toUpperCase()}
          </span>
        )}
      </div>

      {/* Next billing date */}
      {isPaid && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 0",
          borderTop: "1px solid var(--border-dim)",
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            {stripeSubscriptionStatus === "cancelled" ? "Expires" : "Next billing date"}
          </span>
          <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
            {formatDate(planExpiresAt)}
          </span>
        </div>
      )}

      {/* CTA */}
      {isManager ? (
        plan === "STARTER" ? (
          <Link
            href="/pricing"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "9px 0", borderRadius: "var(--r-sm)",
              background: "var(--accent)", color: "#000",
              fontSize: 12, fontWeight: 700, textDecoration: "none",
            }}
          >
            Upgrade plan <ArrowUpRight size={12} />
          </Link>
        ) : (
          <ManageBillingButton isPastDue={isPastDue} />
        )
      ) : (
        <div style={{
          padding: "9px 0", textAlign: "center",
          fontSize: 11, color: "var(--text-3)",
          border: "1px solid var(--border-dim)", borderRadius: "var(--r-sm)",
        }}>
          Only Managers can manage billing
        </div>
      )}
    </div>
  );
}

// Client component for the portal button (needs onClick)
function ManageBillingButton({ isPastDue }: { isPastDue: boolean }) {
  return (
    <form action="/api/stripe/portal" method="POST">
      <button
        type="submit"
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "9px 0", borderRadius: "var(--r-sm)",
          background: isPastDue ? "var(--red)" : "transparent",
          border: isPastDue ? "none" : "1px solid var(--border-normal)",
          color: isPastDue ? "#fff" : "var(--text-2)",
          fontSize: 12, fontWeight: isPastDue ? 700 : 500, cursor: "pointer",
        }}
      >
        {isPastDue ? "Fix payment" : "Manage billing"} <ExternalLink size={11} />
      </button>
    </form>
  );
}
