import { SignIn } from "@stackframe/stack";
import Logo from "@/components/logo";
import CssBg from "@/components/css-bg";
import Link from "next/link";
import AuthHoneypot from "@/components/auth-honeypot";

export default function SignInPage() {

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <CssBg />
      {/* Honeypot — bot detection */}
      <AuthHoneypot />

      <div style={{ position: "fixed", top: 20, left: 24, zIndex: 20 }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.3)", textDecoration: "none", fontWeight: 500 }}>← Back</Link>
      </div>

      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 380, padding: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#C8F000", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", boxShadow: "0 0 24px rgba(200,240,0,0.2)" }}>
            <Logo size={24} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", marginBottom: 4 }}>StockFlow</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sign in to your workspace</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "28px 24px", backdropFilter: "blur(24px)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.5)" }}>
          <SignIn />
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
          By signing in you agree to our{" "}
          <span style={{ color: "rgba(200,240,0,0.5)", cursor: "pointer" }}>Terms</span>
          {" & "}
          <span style={{ color: "rgba(200,240,0,0.5)", cursor: "pointer" }}>Privacy</span>
        </p>
      </div>
    </div>
  );
}
