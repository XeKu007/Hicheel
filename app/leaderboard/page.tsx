import Sidebar from "@/components/sidebar";
import AlertBell from "@/components/alert-bell";
import { getOrgContext } from "@/lib/org";
import { getLeaderboard } from "@/lib/actions/leaderboard";
import { getTranslations } from "@/lib/i18n/index";
import type { LeaderboardEntry } from "@/lib/actions/leaderboard";
import TiltCard from "@/components/tilt-card";

function BadgePills({ badges, t }: { badges: string[]; t: ReturnType<typeof getTranslations> }) {
  if (badges.length === 0) return <span className="text-3">—</span>;
  const badgeTranslations = t.badges as Record<string, string>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
      {badges.map((badge) => (
        <span key={badge} className="badge badge-info">
          {Object.prototype.hasOwnProperty.call(badgeTranslations, badge)
            // eslint-disable-next-line security/detect-object-injection
            ? badgeTranslations[badge]
            : badge}
        </span>
      ))}
    </div>
  );
}

export default async function LeaderboardPage() {
  // getOrgContext is cached in Redis — calling it twice is cheap (2nd call hits cache)
  // Start both in parallel: ctx for sidebar props, leaderboard for data
  const ctx = await getOrgContext();
  const { entries, selfEntry } = await getLeaderboard(ctx);
  const t = getTranslations(ctx.locale);

  return (
    <div className="app-shell">
      <Sidebar currentPath="/leaderboard" orgName={ctx.orgName} role={ctx.role} locale={ctx.locale}
        alertBell={<AlertBell />}
        userName={ctx.userName} userEmail={ctx.userEmail} userAvatar={ctx.userAvatar} />
      <div className="content-wrap">
        <div className="topbar">
          <span className="topbar-brand">StockFlow</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-page">{t.leaderboard.title}</span>
        </div>
        <div className="page-main">
          <div className="page-content">
            {entries.length === 0 ? (
              <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--text-3)", fontSize: "12px" }}>
                {t.leaderboard.noData}
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.leaderboard.rank}</th>
                    <th>{t.leaderboard.member}</th>
                    <th>{t.leaderboard.points}</th>
                    <th>{t.leaderboard.badges}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry: LeaderboardEntry) => {
                    const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
                    const isSelf = selfEntry?.memberId === entry.memberId;
                    return (
                      <tr key={entry.memberId} style={isSelf ? { background: "var(--accent-dim)" } : {}}>
                        <td>
                          <span className="mono" style={{ fontWeight: 700, color: entry.rank <= 3 ? "var(--amber)" : "var(--text-2)" }}>
                            {medal ? `${medal} ${entry.rank}` : `#${entry.rank}`}
                          </span>
                        </td>
                        <td className="text-1" style={{ fontWeight: 500 }}>{entry.displayName}</td>
                        <td>
                          <span className="mono text-accent" style={{ fontWeight: 700 }}>
                            {entry.points.toLocaleString()}
                          </span>
                        </td>
                        <td><BadgePills badges={entry.badges} t={t} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {selfEntry && !entries.find((e: LeaderboardEntry) => e.memberId === selfEntry.memberId) && (
              <>
                <div className="section-header" style={{ marginTop: "1px" }}>{t.leaderboard.yourRank}</div>
                <TiltCard intensity={5} style={{ margin: "0" }}>
                  <table className="data-table">
                    <tbody>
                      <tr style={{ background: "var(--accent-dim)" }}>
                        <td style={{ width: "80px" }}>
                          <span className="mono" style={{ fontWeight: 700, color: "var(--text-2)" }}>#{selfEntry.rank}</span>
                        </td>
                        <td className="text-1" style={{ fontWeight: 500 }}>{selfEntry.displayName}</td>
                        <td>
                          <span className="mono text-accent" style={{ fontWeight: 700 }}>{selfEntry.points.toLocaleString()}</span>
                        </td>
                        <td><BadgePills badges={selfEntry.badges} t={t} /></td>
                      </tr>
                    </tbody>
                  </table>
                </TiltCard>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
