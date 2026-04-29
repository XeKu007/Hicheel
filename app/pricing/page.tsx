import Link from "next/link";
import Logo from "@/components/logo";
import CssBg from "@/components/css-bg";
import { Check } from "lucide-react";
import { CheckoutButton } from "@/components/pricing-buttons";

// Stripe is enabled if the secret key is configured (works on Vercel without extra env var)
const stripeEnabled = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRO_PRICE_ID);

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    desc: "Perfect for small teams getting started",
    color: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.08)",
    accent: "rgba(255,255,255,0.5)",
    features: [
      "Up to 3 team members",
      "500 products",
      "Basic alerts",
      "CSV export",
      "7-day activity log",
    ],
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    desc: "For growing teams that need more power",
    color: "rgba(200,240,0,0.04)",
    border: "#C8F000",
    accent: "#C8F000",
    badge: "Most Popular",
    plan: "PRO" as const,
    features: [
      "Unlimited team members",
      "Unlimited products",
      "Advanced alerts & anomaly detection",
      "Multi-currency support",
      "Daily standup digest",
      "Audit trail (90 days)",
      "Gallery view",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For large organizations with custom needs",
    color: "rgba(0,112,246,0.04)",
    border: "rgba(0,112,246,0.3)",
    accent: "#0070f6",
    plan: "ENTERPRISE" as const,
    features: [
      "Everything in Pro",
      "Prometheus + Grafana monitoring",
      "SSO / SAML",
      "Custom integrations",
      "SLA guarantee",
      "Dedicated support",
      "On-premise option",
    ],
  },
];

export default function PricingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <CssBg />

      {/* Navbar */}
      <nav style={{ position: "relative", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 48px", borderBottom: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", background: "rgba(10,10,10,0.6)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "#C8F000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Logo size={16} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>StockFlow</span>
        </Link>
        <div style={{ display: "flex", gap: 28 }}>
          {[["Features", "/#features"], ["Pricing", "/pricing"], ["Docs", "/docs"]].map(([l, h]) => (
            <Link key={l} href={h} style={{ fontSize: 12, color: l === "Pricing" ? "#C8F000" : "rgba(255,255,255,0.4)", fontWeight: 500, textDecoration: "none" }}>{l}</Link>
          ))}
        </div>
        <Link href="/sign-in" style={{ padding: "8px 18px", borderRadius: 6, background: "#C8F000", color: "#000", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
          Get started
        </Link>
      </nav>

      {/* Content */}
      <main style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "72px 24px 60px", textAlign: "center" }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#C8F000", marginBottom: 16 }}>Pricing</div>
        <h1 style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-0.04em", color: "#fff", marginBottom: 16, lineHeight: 1.05 }}>
          Simple, transparent pricing
        </h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.35)", maxWidth: 440, marginBottom: 56, lineHeight: 1.7 }}>
          Start free, scale as you grow. No hidden fees.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, maxWidth: 900, width: "100%" }}>
          {plans.map((plan) => (
            <div key={plan.name} style={{
              padding: "28px 24px", borderRadius: 14, textAlign: "left",
              background: plan.color,
              border: `1px solid ${plan.border}`,
              backdropFilter: "blur(20px)",
              position: "relative",
            }}>
              {plan.badge && (
                <div style={{
                  position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                  background: "#C8F000", color: "#000", fontSize: 9, fontWeight: 800,
                  padding: "3px 12px", borderRadius: 99, letterSpacing: "0.08em", textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}>{plan.badge}</div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: plan.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{plan.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 6 }}>
                <span style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>{plan.price}</span>
                {plan.period && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>{plan.period}</span>}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 24, lineHeight: 1.5 }}>{plan.desc}</div>
              <div style={{ marginBottom: 24 }}>
                {plan.name === "Starter" ? (
                  <Link href="/sign-in" style={{
                    display: "block", textAlign: "center", padding: "10px 0", borderRadius: 7,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#fff",
                    fontSize: 12, fontWeight: 700, textDecoration: "none",
                  }}>
                    Start free
                  </Link>
                ) : (
                  <CheckoutButton
                    plan={plan.plan!}
                    accent={plan.accent}
                    stripeEnabled={stripeEnabled}
                  />
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <Check size={13} style={{ color: plan.accent, flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 48px", borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(10,10,10,0.5)" }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", fontWeight: 600 }}>StockFlow</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.12)" }}>© 2025 · Built with Next.js 15</span>
        <Link href="/" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textDecoration: "none" }}>← Back to home</Link>
      </footer>
    </div>
  );
}
