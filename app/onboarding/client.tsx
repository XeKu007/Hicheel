"use client";

import { useState } from "react";
import CssBg from "@/components/css-bg";
import Logo from "@/components/logo";

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

export default function OnboardingClient({ pendingInvites, createOrganization, acceptInvite }: Props) {
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
