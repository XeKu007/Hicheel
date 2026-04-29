"use client";

import { useState } from "react";
import CssBg from "@/components/css-bg";
import Logo from "@/components/logo";
import { Check } from "lucide-react";
import { CheckoutButton } from "@/components/pricing-buttons";

const stripeEnabled = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY !== undefined &&
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY !== "";

interface PendingInvite {
  id: string;
  orgName: string;
  organizationId: string;
  createdAt: Date;
}

interface Props {
  pendingInvites: PendingInvite[];
  createOrganization: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  acceptInvite: (inviteId: string) => Promise<{ error?: string; success?: boolean }>;
}

const pricingPlans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    accent: "rgba(255,255,255,0.5)",
    border: "rgba(255,255,255,0.08)",
    features: ["Up to 3 members", "100 products", "Basic alerts"],
  },
  {
    name: "Pro",
    price: "$29",
    period: "/mo",
    accent: "#C8F000",
    border: "#C8F000",
    badge: "Popular",
    plan: "PRO" as const,
    features: ["Unlimited members", "Unlimited products", "AI features"],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    accent: "#0070f6",
    border: "rgba(0,112,246,0.3)",
    plan: "ENTERPRISE" as const,
    features: ["Everything in Pro", "Monitoring", "SLA"],
  },
];

export default function OnboardingClient({ pendingInvites, createOrganization, acceptInvite }: Props) {
  const [step, setStep] = useState<"pricing" | "setup">(pendingInvites.length > 0 ? "setup" : "pricing");
  const [tab, setTab] = useState<"create" | "wait">(pendingInvites.length > 0 ? "wait" : "create");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const glassPanelStyle = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.5)",
  } as const;

  async function handleCreate(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await createOrganization(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  async function handleAccept(inviteId: string) {
    setAcceptingId(inviteId);
    const result = await acceptInvite(inviteId);
    if (result?.error) {
      setError(result.error);
      setAcceptingId(null);
    }
  }

  // ── Pricing step ──────────────────────────────────────────────────────────
  if (step === "pricing") {
    return (
      <div style={{
        minHeight: "100vh", background: "#0a0a0c",
        position: "relative", overflow: "hidden",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "24px",
      }}>
        <CssBg />
        <div style={{ width: "100%", maxWidth: "760px", position: "relative", zIndex: 10 }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <Logo size={40} />
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginTop: "12px", letterSpacing: "-0.02em" }}>
              Choose your plan
            </div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", marginTop: "6px" }}>
              Start free or unlock more with Pro
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            {pricingPlans.map((plan) => (
              <div key={plan.name} style={{
                padding: "20px", borderRadius: 12, position: "relative",
                background: "rgba(255,255,255,0.02)",
                border: `1px solid ${plan.border}`,
              }}>
                {plan.badge && (
                  <div style={{
                    position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                    background: "#C8F000", color: "#000", fontSize: 9, fontWeight: 800,
                    padding: "2px 10px", borderRadius: 99, letterSpacing: "0.08em",
                    textTransform: "uppercase", whiteSpace: "nowrap",
                  }}>{plan.badge}</div>
                )}
                <div style={{ fontSize: 10, fontWeight: 700, color: plan.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{plan.name}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em", marginBottom: 16 }}>
                  {plan.price}<span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>{plan.period}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Check size={11} style={{ color: plan.accent, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{f}</span>
                    </div>
                  ))}
                </div>
                {plan.name === "Starter" ? (
                  <button
                    onClick={() => setStep("setup")}
                    style={{
                      width: "100%", padding: "8px 0", borderRadius: 7,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    Continue free
                  </button>
                ) : (
                  <CheckoutButton plan={plan.plan!} accent={plan.accent} stripeEnabled={stripeEnabled} />
                )}
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => setStep("setup")}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: 11, cursor: "pointer" }}
            >
              Skip for now →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup step ────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0c",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <CssBg />

      <div style={{ width: "100%", maxWidth: "400px", position: "relative", zIndex: 10 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Logo size={48} />
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "13px", fontWeight: 500,
            letterSpacing: "0.18em", textTransform: "uppercase",
            color: "var(--text-1)", marginTop: "12px",
          }}>
            STOCKFLOW
          </div>
          <div className="text-2" style={{ fontSize: "12px", marginTop: "4px" }}>
            Set up your workspace to get started
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
          {(["create", "wait"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); }}
              className={`filter-pill${tab === t ? " active" : ""}`}
              style={{ flex: 1, justifyContent: "center" }}
            >
              {t === "create" ? "Create Org" : (
                <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  Pending Invites
                  {pendingInvites.length > 0 && (
                    <span className="badge badge-ok">{pendingInvites.length}</span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            marginBottom: "12px", padding: "10px 14px", borderRadius: "5px",
            background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.25)",
            color: "var(--red)", fontSize: "12px",
          }}>
            {error}
          </div>
        )}

        {/* Create org */}
        {tab === "create" && (
          <div style={{ ...glassPanelStyle, padding: "20px" }}>
            <form action={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label className="form-label">Organization Name <span style={{ color: "var(--red)" }}>*</span></label>
                <input
                  type="text"
                  name="name"
                  required
                  maxLength={100}
                  placeholder="Acme Corp"
                  className="input-field"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-accent"
                style={{ width: "100%", justifyContent: "center", padding: "8px", opacity: loading ? 0.6 : 1 }}
              >
                {loading ? "Creating..." : "Create Organization"}
              </button>
            </form>
          </div>
        )}

        {/* Pending invites */}
        {tab === "wait" && (
          <div style={glassPanelStyle}>
            {pendingInvites.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <div style={{ fontSize: "28px", marginBottom: "10px" }}>📬</div>
                <div className="text-1" style={{ fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>No pending invitations</div>
                <div className="text-2" style={{ fontSize: "12px" }}>
                  Ask your organization manager to invite you by your account email address.
                </div>
              </div>
            ) : (
              <>
                <div className="section-header">
                  {pendingInvites.length} pending invitation{pendingInvites.length > 1 ? "s" : ""}
                </div>
                {pendingInvites.map((invite) => (
                  <div key={invite.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", borderBottom: "1px solid var(--border-dim)",
                  }}>
                    <div>
                      <div className="text-1" style={{ fontSize: "13px", fontWeight: 500 }}>{invite.orgName}</div>
                      <div className="text-2" style={{ fontSize: "11px", marginTop: "2px" }}>
                        Invited {new Date(invite.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAccept(invite.id)}
                      disabled={acceptingId === invite.id}
                      className="btn-accent"
                      style={{ opacity: acceptingId === invite.id ? 0.6 : 1 }}
                    >
                      {acceptingId === invite.id ? "Joining..." : "Accept"}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
