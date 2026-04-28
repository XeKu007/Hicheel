import Link from "next/link";
import Logo from "@/components/logo";
import CssBg from "@/components/css-bg";
import { ArrowRight, Package, BarChart3, Shield, Zap, Users, Lock, ChevronRight, Bell, ClipboardList, Trophy, Globe } from "lucide-react";
import { CheckoutButton, ManageButton } from "@/components/pricing-buttons";
import type { Plan } from "@/lib/billing";

// Try to get org context — unauthenticated visitors will throw
async function getAuthContext(): Promise<{ plan: Plan; role: string } | null> {
  try {
    const { getOrgContext } = await import("@/lib/org");
    const { prisma } = await import("@/lib/prisma");
    const ctx = await getOrgContext();
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
    });
    return { plan: ((org as Record<string, unknown>)?.plan ?? "STARTER") as Plan, role: ctx.role };
  } catch {
    return null;
  }
}

export default async function Home() {
  const auth = await getAuthContext();
  const isManager = auth?.role === "MANAGER" || auth?.role === "SUPER_ADMIN";
  const currentPlan = auth?.plan ?? null;
  const stripeEnabled = process.env.STRIPE_ENABLED !== "false" && !!process.env.STRIPE_SECRET_KEY;

  const features = [
    { icon: Package,       color: "#C8F000", bg: "rgba(200,240,0,0.08)",   border: "rgba(200,240,0,0.15)",   title: "Smart Inventory",     desc: "Track every item with photos, SKUs, and categories. Adjust stock in one click and organize everything into folders." },
    { icon: Zap,           color: "#0070f6", bg: "rgba(0,112,246,0.08)",   border: "rgba(0,112,246,0.15)",   title: "Real-time Sync",      desc: "Every update your team makes appears instantly on all screens. No refresh. No lag. Everyone always sees the same data." },
    { icon: Users,         color: "#8b5cf6", bg: "rgba(139,92,246,0.08)",  border: "rgba(139,92,246,0.15)",  title: "Role-based Access",   desc: "Staff update stock. Managers run reports and invite people. Admins control everything. The right access for each person." },
    { icon: BarChart3,     color: "#f97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.15)",  title: "Live Analytics",      desc: "Total value, stock health, and 12-week trends — all on your dashboard. Know exactly where your inventory stands." },
    { icon: Bell,          color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.15)",  title: "Automatic Alerts",    desc: "Low stock and sudden drops trigger alerts automatically. You focus on acting — StockFlow handles the watching." },
    { icon: Shield,        color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.15)",  title: "Multi-tenant",        desc: "Every organization gets its own isolated workspace. Your data is completely separate from every other team." },
    { icon: ClipboardList, color: "#06b6d4", bg: "rgba(6,182,212,0.08)",   border: "rgba(6,182,212,0.15)",   title: "Audit Trail",         desc: "Every change is logged — who did it, when, and what changed. Built-in accountability for your whole team." },
    { icon: Trophy,        color: "#eab308", bg: "rgba(234,179,8,0.08)",   border: "rgba(234,179,8,0.15)",   title: "Team Leaderboard",    desc: "Points for every action. Badges for milestones. A leaderboard that makes keeping inventory fun." },
    { icon: Globe,         color: "#ec4899", bg: "rgba(236,72,153,0.08)",  border: "rgba(236,72,153,0.15)",  title: "Multi-currency",      desc: "Set your currency once — MNT, USD, EUR, and more. Every value across the app updates instantly." },
    { icon: Lock,          color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.15)", title: "Secure by Default",   desc: "SSO login, rate limiting on every API, and Redis-cached sessions. Fast and protected from day one." },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <CssBg />

      {/* Navbar */}
      <nav style={{ position: "relative", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 48px", borderBottom: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", background: "rgba(10,10,10,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "#C8F000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Logo size={32} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>StockFlow</span>
          <span style={{ marginLeft: 2, fontSize: 9, fontWeight: 700, color: "#C8F000", background: "rgba(200,240,0,0.06)", border: "1px solid rgba(200,240,0,0.15)", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.08em" }}>BETA</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {[["Features", "/#features"], ["Pricing", "/#pricing"], ["Docs", "/#docs"]].map(([l, h]) => (
            <Link key={l} href={h} style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 500, textDecoration: "none" }}>{l}</Link>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/sign-in" style={{ padding: "7px 16px", borderRadius: 6, color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
          <Link href="/sign-up" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 6, background: "#C8F000", color: "#000", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
            Get started <ChevronRight size={12} />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px 60px", textAlign: "center" }}>
      
        <h1 style={{ fontSize: 68, fontWeight: 900, lineHeight: 1.0, letterSpacing: "-0.05em", marginBottom: 22, maxWidth: 720 }}>
          <span style={{ color: "#fff" }}>Inventory, simplified</span><br />
          <span style={{ color: "#C8F000" }}>for your whole team</span>
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.8, marginBottom: 40, color: "rgba(255,255,255,0.35)", maxWidth: 460 }}>
          Track stock, dispatch items, and stay in sync — from any device, in real time. No spreadsheets. No guesswork.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 64, alignItems: "center" }}>
          <Link href="/sign-up" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 8, background: "#C8F000", color: "#000", fontSize: 13, fontWeight: 800, textDecoration: "none", boxShadow: "0 0 32px rgba(200,240,0,0.2)", letterSpacing: "-0.01em" }}>
            Start for free <ArrowRight size={14} />
          </Link>
          <Link href="#features" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: 600, textDecoration: "none", backdropFilter: "blur(12px)" }}>
            See features
          </Link>
        </div>

        <div style={{ display: "flex", gap: 0, marginBottom: 72, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.02)", backdropFilter: "blur(20px)", maxWidth: 440, width: "100%" }}>
          {[{ v: "99.9%", l: "Uptime" }, { v: "<50ms", l: "Response" }, { v: "∞", l: "Products" }, { v: "3", l: "Roles" }].map((s, i, arr) => (
            <div key={i} style={{ flex: 1, padding: "16px 0", textAlign: "center", borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "#C8F000", lineHeight: 1, marginBottom: 4 }}>{s.v}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>{s.l}</div>
            </div>
          ))}
        </div>

        <div id="features" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 900, width: "100%" }}>
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} style={{
                padding: "22px 20px", borderRadius: 12, textAlign: "left",
                background: "rgba(255,255,255,0.02)", 
                border: `1px solid ${f.border}`,
                backdropFilter: "blur(20px)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, marginBottom: 14,
                  background: f.bg, border: `1px solid ${f.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={16} style={{ color: f.color }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 7, letterSpacing: "-0.02em" }}>{f.title}</div>
                <div style={{ fontSize: 12, lineHeight: 1.75, color: "rgba(255,255,255,0.38)" }}>{f.desc}</div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Pricing */}
      <div style={{ position: "relative", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)", backdropFilter: "blur(12px)", padding: "80px 24px", display: "flex", justifyContent: "center" }} id="pricing">
        <div style={{ maxWidth: 900, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#C8F000", marginBottom: 16 }}>Pricing</div>
          <h2 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.04em", color: "#fff", marginBottom: 12, lineHeight: 1.05 }}>Simple, transparent pricing</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", maxWidth: 400, lineHeight: 1.7, margin: "0 auto 48px" }}>Start free, scale as you grow. No hidden fees.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { name: "Starter", price: "Free", period: "", planKey: "STARTER" as Plan, desc: "Perfect for small teams getting started", color: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.08)", accent: "rgba(255,255,255,0.5)", features: ["Up to 3 team members", "5 inventory categories", "100 products", "Basic alerts", "CSV export", "7-day activity log"] },
              { name: "Pro", price: "$29", period: "/mo", planKey: "PRO" as Plan, desc: "For growing teams that need more power", color: "rgba(200,240,0,0.04)", border: "#C8F000", accent: "#C8F000", badge: "Most Popular", features: ["Unlimited team members", "Unlimited products", "Advanced alerts & anomaly detection", "Multi-currency support", "Daily standup digest", "Audit trail (90 days)", "Gallery view", "Priority support"] },
              { name: "Enterprise", price: "$100", period: "/mo", planKey: "ENTERPRISE" as Plan, desc: "For large organizations with custom needs", color: "rgba(0,112,246,0.04)", border: "rgba(0,112,246,0.3)", accent: "#0070f6", features: ["Everything in Pro", "Prometheus + Grafana monitoring", "SSO / SAML", "Custom integrations", "SLA guarantee", "Dedicated support", "On-premise option"] },
            ].map((plan) => {
              const isCurrent = currentPlan === plan.planKey;
              const isUpgrade = !isCurrent && plan.planKey !== "STARTER";

              // Determine CTA
              let ctaContent: React.ReactNode;
              if (isCurrent) {
                ctaContent = (
                  <div style={{ display: "block", textAlign: "center", padding: "10px 0", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 600 }}>
                    Current plan ✓
                  </div>
                );
              } else if (plan.planKey === "STARTER") {
                ctaContent = (
                  <Link href={auth ? "/dashboard" : "/sign-up"} style={{ display: "block", textAlign: "center", padding: "10px 0", borderRadius: 7, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                    {auth ? "Go to dashboard" : "Start free"}
                  </Link>
                );
              } else if (!auth) {
                // Unauthenticated — link to sign-up with plan param
                ctaContent = (
                  <Link href={`/sign-up?plan=${plan.planKey.toLowerCase()}`} style={{ display: "block", textAlign: "center", padding: "10px 0", borderRadius: 7, background: plan.accent === "#C8F000" ? "#C8F000" : "rgba(255,255,255,0.06)", border: plan.accent === "#C8F000" ? "none" : "1px solid rgba(255,255,255,0.1)", color: plan.accent === "#C8F000" ? "#000" : "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                    Get started
                  </Link>
                );
              } else if (isManager && isUpgrade) {
                // Authenticated manager — checkout button
                ctaContent = (
                  <CheckoutButton plan={plan.planKey as "PRO" | "ENTERPRISE"} accent={plan.accent} stripeEnabled={stripeEnabled} />
                );
              } else if (isManager && isCurrent && currentPlan !== "STARTER") {
                // Manage billing
                ctaContent = (
                  <ManageButton accent={plan.accent} stripeEnabled={stripeEnabled} />
                );
              } else {
                // Non-manager authenticated
                ctaContent = (
                  <div style={{ display: "block", textAlign: "center", padding: "10px 0", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)", fontSize: 12, fontWeight: 600, cursor: "not-allowed" }} title="Only Managers can manage billing">
                    Contact your Manager
                  </div>
                );
              }

              return (
                <div key={plan.name} style={{ padding: "28px 24px", borderRadius: 14, textAlign: "left", background: plan.color, border: `1px solid ${isCurrent ? plan.accent : plan.border}`, backdropFilter: "blur(20px)", position: "relative" }}>
                  {"badge" in plan && plan.badge && (
                    <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#C8F000", color: "#000", fontSize: 9, fontWeight: 800, padding: "3px 12px", borderRadius: 99, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{plan.badge}</div>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 700, color: plan.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{plan.name}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 6 }}>
                    <span style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>{plan.price}</span>
                    {plan.period && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>{plan.period}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 20, lineHeight: 1.5 }}>{plan.desc}</div>
                  <div style={{ marginBottom: 20 }}>{ctaContent}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {plan.features.map((f) => (
                      <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <span style={{ color: plan.accent, flexShrink: 0, fontSize: 12, marginTop: 1 }}>✓</span>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 48px", borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(10,10,10,0.5)", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: "#C8F000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Logo size={11} />
          </div>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", fontWeight: 600 }}>StockFlow</span>
        </div>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.12)" }}>© 2025 · Built with Next.js 15</span>
        <div style={{ display: "flex", gap: 20 }}>
          {["Privacy", "Terms", "Contact"].map(l => (
            <span key={l} style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", cursor: "pointer" }}>{l}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}
