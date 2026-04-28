import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext } from "@/lib/org";
import { getOrCreateSession, getRecentMessages } from "@/lib/actions/ai/chat";
import AIChatClient from "./client";

export default async function AIChatPage() {
  const ctx = await getOrgContext();
  const { organizationId, memberId, role, orgName = "", locale } = ctx;

  const sessionId = await getOrCreateSession(organizationId, memberId);
  const recentMessages = await getRecentMessages(organizationId, memberId, sessionId);

  const initialMessages = recentMessages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  return (
    <div className="app-shell">
      <Sidebar
        currentPath="/ai"
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
          <span className="topbar-page">AI Assistant</span>
        </div>
        <div className="page-main">
          <div className="page-content">
            <AIChatClient initialMessages={initialMessages} sessionId={sessionId} />
          </div>
        </div>
      </div>
    </div>
  );
}
