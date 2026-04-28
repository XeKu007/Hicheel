"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function CheckoutButton({
  plan,
  accent,
  stripeEnabled = false,
}: {
  plan: "PRO" | "ENTERPRISE";
  accent: string;
  stripeEnabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Stripe not configured — show contact link
  if (!stripeEnabled) {
    return (
      <a
        href="mailto:hello@stockflow.app?subject=Upgrade to Pro"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "100%", padding: "10px 0", borderRadius: 7,
          background: accent === "#C8F000" ? "#C8F000" : "rgba(255,255,255,0.06)",
          border: accent === "#C8F000" ? "none" : "1px solid rgba(255,255,255,0.1)",
          color: accent === "#C8F000" ? "#000" : "#fff",
          fontSize: 12, fontWeight: 700, textDecoration: "none",
        }}
      >
        Contact us to upgrade
      </a>
    );
  }

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        router.push(data.url);
      } else {
        alert(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
      }
    } catch {
      alert("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        width: "100%", padding: "10px 0", borderRadius: 7,
        background: accent === "#C8F000" ? "#C8F000" : "rgba(255,255,255,0.06)",
        border: accent === "#C8F000" ? "none" : "1px solid rgba(255,255,255,0.1)",
        color: accent === "#C8F000" ? "#000" : "#fff",
        fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : null}
      {loading ? "Redirecting..." : "Get started"}
    </button>
  );
}

export function ManageButton({ accent, stripeEnabled = false }: { accent: string; stripeEnabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!stripeEnabled) {
    return (
      <a
        href="mailto:hello@stockflow.app?subject=Manage billing"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "100%", padding: "10px 0", borderRadius: 7,
          background: "rgba(255,255,255,0.06)",
          border: `1px solid ${accent}40`,
          color: accent, fontSize: 12, fontWeight: 700, textDecoration: "none",
        }}
      >
        Contact us
      </a>
    );
  }

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        router.push(data.url);
      } else {
        alert(data.error ?? "Something went wrong.");
        setLoading(false);
      }
    } catch {
      alert("Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        width: "100%", padding: "10px 0", borderRadius: 7,
        background: "rgba(255,255,255,0.06)",
        border: `1px solid ${accent}40`,
        color: accent, fontSize: 12, fontWeight: 700,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : null}
      {loading ? "Loading..." : "Manage billing"}
    </button>
  );
}
