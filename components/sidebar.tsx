"use client";

import { useState, useEffect, memo } from "react";
import Image from "next/image";
import {
  LayoutDashboard, Package, PackagePlus,
  Bell, Trophy, Settings, Users, Building2,
  ClipboardList, Activity, MessageSquare, GitBranch, RefreshCw, Bot,
  ChevronLeft, ChevronRight as ChevronRightIcon, LogOut,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { LanguageSwitcher } from "./language-switcher";
import { getTranslations } from "@/lib/i18n/index";
import type { OrgRole } from "@/lib/org";
import type { ReactNode } from "react";

const COLLAPSED_KEY = "sidebar_collapsed";

// ─── NavItem — memoized to prevent re-renders when parent state changes ───────
interface NavItemProps {
  item: { name: string; href: string; icon: LucideIcon };
  currentPath: string;
  isCollapsed: boolean;
  hovered: string | null;
  accent: string;
  accentDim: string;
  onMouseEnter: (href: string) => void;
  onMouseLeave: () => void;
}

const NavItem = memo(function NavItem({
  item, currentPath, isCollapsed, hovered, accent, accentDim, onMouseEnter, onMouseLeave,
}: NavItemProps) {
  const Icon = item.icon;
  const isActive = currentPath === item.href;
  const isHov = hovered === item.href;
  return (
    <Link
      href={item.href}
      
      aria-label={item.name}
      title={isCollapsed ? item.name : undefined}
      onMouseEnter={() => onMouseEnter(item.href)}
      onMouseLeave={onMouseLeave}
      style={{
        width: isCollapsed ? "36px" : "calc(100% - 16px)",
        height: 36, borderRadius: 7,
        display: "flex", alignItems: "center",
        gap: isCollapsed ? 0 : 10,
        padding: isCollapsed ? "0" : "0 12px",
        justifyContent: isCollapsed ? "center" : "flex-start",
        color: isActive ? accent : isHov ? "var(--text-1)" : "var(--text-3)",
        background: isActive ? accentDim : isHov ? "rgba(255,255,255,0.04)" : "transparent",
        cursor: "pointer", textDecoration: "none",
        fontSize: 12, fontWeight: isActive ? 600 : 500,
        whiteSpace: "nowrap", overflow: "hidden",
        margin: isCollapsed ? "1px auto" : "1px 8px",
        borderLeft: isCollapsed ? "none" : (isActive ? `2px solid ${accent}` : "2px solid transparent"),
        transition: "all 0.12s",
        boxShadow: isActive ? `0 0 12px ${accentDim}` : "none",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <Icon
        size={14} strokeWidth={1.6}
        style={{ flexShrink: 0, color: isActive ? accent : "inherit" } as React.CSSProperties}
      />
      {!isCollapsed && (
        <>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</span>
          {isActive && (
            <span style={{
              width: 4, height: 4, borderRadius: "50%",
              background: accent,
              boxShadow: `0 0 6px ${accent}`,
              flexShrink: 0,
            }} />
          )}
        </>
      )}
    </Link>
  );
});

export default function Sidebar({
  currentPath = "/dashboard",
  orgName,
  role,
  locale = "en",
  alertBell,
  userButton,
  userName,
  userEmail,
  userAvatar,
}: {
  currentPath: string;
  orgName?: string;
  role?: OrgRole;
  locale?: string;
  alertBell?: ReactNode;
  userButton?: ReactNode;
  userName?: string;
  userEmail?: string;
  userAvatar?: string | null;
}) {
  const t = getTranslations(locale);
  const [hovered, setHovered] = useState<string | null>(null);
  // Start collapsed on mobile, expanded on desktop — hydrate from localStorage
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      if (stored !== null) setCollapsed(stored === "1");
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  const navigation = [
    { name: t.nav.dashboard,   href: "/dashboard",   icon: LayoutDashboard },
    { name: t.nav.inventory,   href: "/inventory",   icon: Package },
    { name: t.nav.addProduct,  href: "/add-product", icon: PackagePlus },
    { name: t.nav.alerts,      href: "/alerts",      icon: Bell },
    { name: t.nav.leaderboard, href: "/leaderboard", icon: Trophy },
    { name: t.nav.settings,    href: "/settings",    icon: Settings },
  ];

  const orgNavigation = [
    { name: t.nav.members, href: "/org/members", icon: Users },
    ...(role === "MANAGER" || role === "SUPER_ADMIN"
      ? [
          { name: t.nav.orgSettings, href: "/org/settings",  icon: Building2 },
          { name: "Audit Log",       href: "/org/audit",     icon: ClipboardList },
        ]
      : []),
    ...(role === "SUPER_ADMIN"
      ? [{ name: "Monitoring", href: "/admin/monitoring", icon: Activity }]
      : []),
  ];

  const aiNavigation = [
    { name: "AI Assistant", href: "/ai", icon: MessageSquare },
    ...(role === "MANAGER" || role === "SUPER_ADMIN"
      ? [
          { name: "Workflows",  href: "/workflows", icon: GitBranch },
          { name: "Reorder",    href: "/reorder",   icon: RefreshCw },
          { name: "Agent",      href: "/agent",     icon: Bot },
        ]
      : []),
  ];

  const isManager = role === "MANAGER" || role === "SUPER_ADMIN";
  const accent = isManager ? "#C8F000" : "#0070f6";
  const accentDim = isManager ? "rgba(200,240,0,0.08)" : "rgba(0,112,246,0.08)";
  const accentGlow = isManager ? "rgba(200,240,0,0.3)" : "rgba(0,112,246,0.3)";
  const accentOrb = isManager ? "rgba(200,240,0,0.06)" : "rgba(0,112,246,0.06)";

  // Avoid layout shift before hydration — render expanded width
  const isCollapsed = mounted && collapsed;
  const sidebarWidth = isCollapsed ? "52px" : "220px";

  // Stable callbacks to prevent NavItem re-renders
  const handleMouseEnter = (href: string) => setHovered(href);
  const handleMouseLeave = () => setHovered(null);

  // Shared NavItem props
  const navProps = { currentPath, isCollapsed, hovered, accent, accentDim, onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave };

  return (
    <aside style={{
      width: sidebarWidth,
      flexShrink: 0,
      background: "rgba(10,10,12,0.97)",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column", alignItems: "flex-start",
      padding: "16px 0 12px", gap: 0,
      position: "relative", height: "100vh", zIndex: 20, alignSelf: "stretch",
      boxShadow: "4px 0 32px rgba(0,0,0,0.4)",
      transition: "width 0.18s cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
    }}>

      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: -40, left: -40,
        width: 200, height: 200, borderRadius: "50%",
        background: `radial-gradient(circle, ${accentOrb} 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Logo + brand */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: isCollapsed ? "center" : "space-between",
        padding: isCollapsed ? "0" : "0 8px 0 16px",
        marginBottom: 24, width: "100%",
      }}>
        <Link
          href="/dashboard"
          
          style={{
            display: "flex", alignItems: "center", gap: isCollapsed ? 0 : 10,
            textDecoration: "none", minWidth: 0,
          }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: accent, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 16px ${accentGlow}`,
          }}>
            <Image
              src={isManager ? "/logo.png" : "/logo1.png"}
              alt="Logo"
              width={64}
              height={64}
              style={{ objectFit: "contain" }}
              priority
            />
          </div>
          {!isCollapsed && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
                StockFlow
              </div>
              {orgName && (
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                  {orgName}
                </div>
              )}
            </div>
          )}
        </Link>

        {/* Collapse toggle — only show when expanded */}
        {!isCollapsed && (
          <button
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-3)", padding: "4px", borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {isCollapsed && (
        <button
          onClick={toggleCollapsed}
          aria-label="Expand sidebar"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-3)", padding: "4px", borderRadius: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "36px", margin: "0 auto 8px",
          }}
        >
          <ChevronRightIcon size={14} />
        </button>
      )}

      {/* Section label */}
      {!isCollapsed && (
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", padding: "0 20px", marginBottom: 6 }}>
          Main
        </div>
      )}

      {/* Main nav */}
      {navigation.map((item) => <NavItem key={item.href} item={item} {...navProps} />)}

      {/* Org nav */}
      {orgNavigation.length > 0 && (
        <>
          <div style={{ width: isCollapsed ? "28px" : "calc(100% - 32px)", height: 1, background: "rgba(255,255,255,0.05)", margin: isCollapsed ? "10px auto 8px" : "10px 16px 8px" }} />
          {!isCollapsed && (
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", padding: "0 20px", marginBottom: 6 }}>
              Organization
            </div>
          )}
          {orgNavigation.map((item) => <NavItem key={item.href} item={item} {...navProps} />)}
        </>
      )}

      {/* AI nav */}
      <>
        <div style={{ width: isCollapsed ? "28px" : "calc(100% - 32px)", height: 1, background: "rgba(255,255,255,0.05)", margin: isCollapsed ? "10px auto 8px" : "10px 16px 8px" }} />
        {!isCollapsed && (
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", padding: "0 20px", marginBottom: 6 }}>
            AI
          </div>
        )}
        {aiNavigation.map((item) => <NavItem key={item.href} item={item} {...navProps} />)}
      </>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom divider */}
      <div style={{ width: isCollapsed ? "28px" : "calc(100% - 32px)", height: 1, background: "rgba(255,255,255,0.05)", margin: isCollapsed ? "0 auto 10px" : "0 16px 10px" }} />

      {/* Bottom utilities */}
      {isCollapsed ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "0 8px", width: "100%" }}>
          {alertBell}
          {/* Avatar */}
          {(userName || userEmail || userAvatar) && (
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "var(--accent)", overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
              title={userName ?? userEmail ?? ""}
            >
              {userAvatar
                ? <Image src={userAvatar} alt={userName ?? ""} width={28} height={28} style={{ objectFit: "cover", borderRadius: "50%" }} />
                : <span style={{ fontSize: 11, fontWeight: 700, color: "#000" }}>
                    {(userName || userEmail || "?").charAt(0).toUpperCase()}
                  </span>
              }
            </div>
          )}
          {/* Sign out */}
          <Link
            href="/handler/sign-out"
            title="Sign out"
            style={{
              width: 28, height: 28,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6, color: "var(--text-3)",
              textDecoration: "none", transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-1)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--text-3)";
            }}
          >
            <LogOut size={13} strokeWidth={1.8} />
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 8px", width: "100%" }}>
          <div style={{ width: "100%" }}><LanguageSwitcher locale={locale} compact /></div>
          <div style={{ width: "100%" }}>{alertBell}</div>
          {/* User row: avatar + name/email + sign out */}
          {(userName || userEmail || userAvatar) && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", minWidth: 0 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 8px", borderRadius: 6,
                flex: 1, minWidth: 0, overflow: "hidden",
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  background: "var(--accent)", overflow: "hidden",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {userAvatar
                    ? <Image src={userAvatar} alt={userName ?? ""} width={26} height={26} style={{ objectFit: "cover", borderRadius: "50%" }} />
                    : <span style={{ fontSize: 11, fontWeight: 700, color: "#000" }}>
                        {(userName || userEmail || "?").charAt(0).toUpperCase()}
                      </span>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  {userName && (
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: "var(--text-1)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{userName}</div>
                  )}
                  {userEmail && (
                    <div style={{
                      fontSize: 10, color: "var(--text-3)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{userEmail}</div>
                  )}
                </div>
              </div>
              <Link
                href="/handler/sign-out"
                title="Sign out"
                style={{
                  flexShrink: 0, width: 28, height: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 6, color: "var(--text-3)",
                  textDecoration: "none", transition: "background 0.12s, color 0.12s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-1)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-3)";
                }}
              >
                <LogOut size={13} strokeWidth={1.8} />
              </Link>
            </div>
          )}
          {/* Fallback: legacy userButton prop */}
          {!userName && !userEmail && !userAvatar && userButton && (
            <div style={{ width: "100%" }}>{userButton}</div>
          )}
        </div>
      )}
    </aside>
  );
}
