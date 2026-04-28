"use client";

import Link from "next/link";
import Logo from "@/components/logo";
import { useState, useEffect, useRef } from "react";
import {
  BookOpen, Zap, Package, Truck, Bell, Users, Trophy,
  Building2, ClipboardList, Coffee, Keyboard, Settings,
  Activity, Search, ChevronRight, X,
} from "lucide-react";

const sections = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Zap,
    color: "#C8F000",
    items: [
      {
        title: "Create your account",
        desc: "Go to /sign-in and sign up. On your first login you'll land on onboarding — give your organization a name and you're ready to go. The first user becomes a Manager automatically.",
      },
      {
        title: "Invite your team",
        desc: "Open Members and invite teammates by email. When they sign in they'll see a pending invitation and can join your organization as Staff with one click.",
      },
      {
        title: "Add your first product",
        desc: "Press N or click '+ Add Product'. Enter a name, quantity, and price. Optionally add a SKU, photo, category, and a low stock threshold to get alerted before you run out.",
      },
      {
        title: "Your dashboard at a glance",
        desc: "The dashboard shows total SKUs, inventory value, low stock count, out-of-stock count, and in-stock percentage. Managers also see a daily digest and a 12-week trend chart.",
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    icon: Package,
    color: "#0070f6",
    items: [
      {
        title: "Table view and gallery view",
        desc: "Switch between a detailed table and a visual gallery using the icon in the toolbar. Your preference is saved across sessions.",
      },
      {
        title: "Search and filter",
        desc: "Search by product name using the search bar, or press ` to jump straight to it. Filter by status — All, In Stock, Low, or Critical — to focus on what needs attention.",
      },
      {
        title: "Category folders",
        desc: "Assign a category to any product and it appears in the folder panel on the left. Click a folder to see only that category. Items without a category are grouped under Uncategorized.",
      },
      {
        title: "Edit a product",
        desc: "Click the pencil icon on any row to open the edit form. Update the name, price, quantity, SKU, category, low stock threshold, or image. Changes save instantly.",
      },
      {
        title: "Delete a product",
        desc: "Click the trash icon to remove a product. If it had stock remaining, an anomaly alert is created automatically and the action is recorded in the audit log.",
      },
      {
        title: "Export to CSV",
        desc: "Managers can export the full inventory list as a CSV file from the toolbar. Includes name, SKU, category, price, quantity, and status.",
      },
      {
        title: "Live sync across devices",
        desc: "Any change made by a teammate appears on your screen instantly — no refresh needed. Everyone always sees the same data.",
      },
    ],
  },
  {
    id: "dispatch",
    title: "Dispatch",
    icon: Truck,
    color: "#f97316",
    items: [
      {
        title: "Dispatching stock",
        desc: "Go to Dispatch (press D or click Dispatch in the sidebar). Pick a product, enter the quantity going out, and optionally add a reason like Sold, Damaged, or Transferred.",
      },
      {
        title: "What happens after a dispatch",
        desc: "Stock is reduced immediately. If the new quantity hits a low stock threshold or drops more than 30% in one go, an alert is created automatically.",
      },
    ],
  },
  {
    id: "alerts",
    title: "Alerts",
    icon: Bell,
    color: "#f59e0b",
    items: [
      {
        title: "Low stock alerts",
        desc: "When a product's quantity falls to or below its threshold, an alert is created. Only one active low stock alert exists per product at a time — no duplicates.",
      },
      {
        title: "Anomaly alerts",
        desc: "If stock drops more than 30% in a single update, or a product with stock is deleted, an anomaly alert is created so nothing slips through unnoticed.",
      },
      {
        title: "The alert bell",
        desc: "The bell icon in the sidebar shows how many unread alerts you have. Click it or press A to go to the Alerts page.",
      },
      {
        title: "Dismissing alerts",
        desc: "Dismiss alerts one by one or clear them all at once with Dismiss All. Dismissed alerts stay in the list so you have a record.",
      },
    ],
  },
  {
    id: "team",
    title: "Team & Roles",
    icon: Users,
    color: "#8b5cf6",
    items: [
      {
        title: "Three roles, clear boundaries",
        desc: "Staff can view and edit inventory, dispatch stock, and check alerts. Managers can also invite members, approve requests, export data, and access the audit log. Super Admins get everything plus system monitoring.",
      },
      {
        title: "Inviting members",
        desc: "Managers invite people by email from the Members page. The invitee sees a pending invitation on their dashboard and joins as Staff.",
      },
      {
        title: "Approvals",
        desc: "Role changes and member removals go through an approval step. Managers review and approve or reject requests at /org/approvals — keeping changes deliberate and traceable.",
      },
    ],
  },
  {
    id: "leaderboard",
    title: "Leaderboard",
    icon: Trophy,
    color: "#eab308",
    items: [
      {
        title: "Earning points",
        desc: "Every action earns points: +10 for adding a product, +5 for updating one, +1 for checking inventory. Points add up over time.",
      },
      {
        title: "Badges",
        desc: "Reach milestones and earn badges automatically — First Product, Hundred Updates, Inventory Checker, and more. Badges show on your profile.",
      },
      {
        title: "Team rankings",
        desc: "The leaderboard ranks everyone by total points. Your own position is highlighted. If you're outside the top group, your rank still shows at the bottom.",
      },
    ],
  },
  {
    id: "org-settings",
    title: "Org Settings",
    icon: Building2,
    color: "#06b6d4",
    items: [
      {
        title: "Organization name",
        desc: "Managers can rename the organization from /org/settings. The updated name shows in the sidebar and topbar right away.",
      },
      {
        title: "Display currency",
        desc: "Pick the currency your team works in — MNT, USD, EUR, CNY, JPY, KRW, or GBP. All monetary values across the app update instantly.",
      },
      {
        title: "Delete organization",
        desc: "Permanently removes the organization and all its data. This cannot be undone — use with care.",
      },
    ],
  },
  {
    id: "audit",
    title: "Audit Log",
    icon: ClipboardList,
    color: "#10b981",
    items: [
      {
        title: "What gets logged",
        desc: "Every product create, update, and delete is recorded with the before and after values. Membership actions — invites, role changes, removals — are logged too.",
      },
      {
        title: "Filtering the log",
        desc: "Filter by action type (Create, Update, Delete, Role Change, Membership), entity type, or date range to find exactly what you're looking for.",
      },
      {
        title: "Pagination",
        desc: "The log loads 50 entries at a time. Click Load more to go further back in history.",
      },
    ],
  },
  {
    id: "digest",
    title: "Daily Digest",
    icon: Coffee,
    color: "#f97316",
    items: [
      {
        title: "Your daily summary",
        desc: "Managers see a digest card on the dashboard each morning: total inventory value, new products added, dispatches made, alerts created, and alerts resolved — all from the previous day.",
      },
      {
        title: "When it refreshes",
        desc: "The digest updates automatically at 09:00 Ulaanbaatar time (UTC+8) every day.",
      },
      {
        title: "Who sees it",
        desc: "The digest is visible to Managers and Super Admins only.",
      },
    ],
  },
  {
    id: "shortcuts",
    title: "Keyboard Shortcuts",
    icon: Keyboard,
    color: "#C8F000",
    items: [
      { title: "N — New product", desc: "Jump straight to the Add Product form." },
      { title: "D — Dispatch", desc: "Open the Dispatch page." },
      { title: "A — Alerts", desc: "Go to the Alerts page." },
      { title: "` (backtick) — Search", desc: "Focus the search bar on the Inventory page." },
      { title: "? — Shortcuts panel", desc: "Open the full keyboard shortcuts reference." },
    ],
  },
  {
    id: "account",
    title: "Account",
    icon: Settings,
    color: "#94a3b8",
    items: [
      {
        title: "Profile and security",
        desc: "Update your display name, email, password, and connected accounts at /settings.",
      },
      {
        title: "Language",
        desc: "Switch between English and Mongolian using the language switcher at the bottom of the sidebar.",
      },
    ],
  },
  {
    id: "monitoring",
    title: "Monitoring",
    icon: Activity,
    color: "#ef4444",
    items: [
      {
        title: "Grafana dashboard",
        desc: "Super Admins can view system health metrics at /admin/monitoring via an embedded Grafana dashboard.",
      },
      {
        title: "Prometheus metrics",
        desc: "The /api/metrics endpoint exposes Prometheus-format metrics, protected by a bearer token set in METRICS_SECRET.",
      },
    ],
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const [search, setSearch] = useState("");
  const [, setMobileNavOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const filtered = search.trim()
    ? sections.map((s) => ({
        ...s,
        items: s.items.filter(
          (item) =>
            item.title.toLowerCase().includes(search.toLowerCase()) ||
            item.desc.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((s) => s.items.length > 0)
    : sections;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection(e.target.id);
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
    setMobileNavOpen(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", color: "#fff", fontFamily: "inherit" }}>
      {/* Top nav */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: 56,
        background: "rgba(10,10,12,0.9)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: "#C8F000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Logo size={14} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>StockFlow</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", margin: "0 4px" }}>/</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>Docs</span>
        </Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link href="/#features" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Features</Link>
          <Link href="/pricing" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Pricing</Link>
          <Link href="/sign-in" style={{ padding: "6px 14px", borderRadius: 6, background: "#C8F000", color: "#000", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
            Get started
          </Link>
        </div>
      </nav>

      <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto", minHeight: "calc(100vh - 56px)" }}>
        {/* Sidebar */}
        <aside style={{
          width: 240, flexShrink: 0,
          position: "sticky", top: 56, height: "calc(100vh - 56px)",
          overflowY: "auto", padding: "28px 0",
          borderRight: "1px solid rgba(255,255,255,0.05)",
        }}>
          {/* Search */}
          <div style={{ padding: "0 16px 20px", position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 28, top: "50%", transform: "translateY(-60%)", color: "rgba(255,255,255,0.25)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search docs..."
              style={{
                width: "100%", padding: "8px 12px 8px 32px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 7, fontSize: 12,
                color: "#fff", outline: "none",
                boxSizing: "border-box",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 24, top: "50%", transform: "translateY(-60%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Nav items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
            {sections.map((s) => {
              const Icon = s.icon;
              const isActive = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "7px 10px", borderRadius: 6,
                    background: isActive ? "rgba(200,240,0,0.07)" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left", width: "100%",
                    color: isActive ? "#C8F000" : "rgba(255,255,255,0.4)",
                    fontSize: 12, fontWeight: isActive ? 600 : 400,
                    transition: "all 0.12s",
                    borderLeft: isActive ? "2px solid #C8F000" : "2px solid transparent",
                  }}
                >
                  <Icon size={13} style={{ flexShrink: 0, color: isActive ? "#C8F000" : s.color, opacity: isActive ? 1 : 0.6 }} />
                  {s.title}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main content */}
        <main ref={mainRef} style={{ flex: 1, padding: "48px 56px 80px", minWidth: 0 }}>
          {/* Hero */}
          {!search && (
            <div style={{ marginBottom: 56 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <BookOpen size={14} style={{ color: "#C8F000" }} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#C8F000" }}>Documentation</span>
              </div>
              <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", color: "#fff", margin: "0 0 12px", lineHeight: 1.1 }}>
                StockFlow Docs
              </h1>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.7, maxWidth: 480, margin: 0 }}>
                Everything you need to set up your team, manage inventory, and get the most out of StockFlow.
              </p>

              {/* Quick links */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 28 }}>
                {sections.slice(0, 4).map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      onClick={() => scrollTo(s.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "8px 14px", borderRadius: 8,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500,
                        cursor: "pointer", textDecoration: "none",
                        transition: "all 0.12s",
                      }}
                    >
                      <Icon size={12} style={{ color: s.color }} />
                      {s.title}
                      <ChevronRight size={11} style={{ opacity: 0.4 }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: 64 }}>
            {filtered.map((section) => {
              const Icon = section.icon;
              return (
                <section key={section.id} id={section.id} style={{ scrollMarginTop: 80 }}>
                  {/* Section header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${section.color}14`,
                      border: `1px solid ${section.color}28`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <Icon size={15} style={{ color: section.color }} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
                        {section.title}
                      </h2>
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {section.items.map((item, i) => (
                      <div
                        key={item.title}
                        style={{
                          padding: "18px 22px",
                          background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.025)",
                          borderBottom: i < section.items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 5, letterSpacing: "-0.01em" }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
                          {item.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.25)" }}>
                <Search size={28} style={{ marginBottom: 12, opacity: 0.4 }} />
                <div style={{ fontSize: 14 }}>No results for &ldquo;{search}&rdquo;</div>
              </div>
            )}
          </div>
        </main>
      </div>

      <footer style={{
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "20px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(10,10,12,0.8)",
      }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontWeight: 600 }}>StockFlow</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.12)" }}>© 2025 · Built with Next.js 15</span>
        <Link href="/" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textDecoration: "none" }}>← Back to home</Link>
      </footer>
    </div>
  );
}
