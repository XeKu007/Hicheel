import { UserButton } from "@stackframe/stack";
import { BarChart3, Package, Plus, Settings } from "lucide-react";
import Link from "next/link";
import Logo from "./logo";

export default function Sidebar({
  currentPath = "/dashboard",
}: {
  currentPath: string;
}) {
  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
    { name: "Inventory", href: "/inventory", icon: Package },
    { name: "Add Product", href: "/add-product", icon: Plus },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="fixed left-0 top-0 w-64 min-h-screen z-10 flex flex-col"
      style={{ background: "linear-gradient(180deg, #0d0d1a 0%, #0a0a14 100%)", borderRight: "1px solid rgba(56,189,248,0.15)" }}>

      {/* Logo area */}
      <div className="flex items-center gap-3 py-5 px-6"
        style={{ borderBottom: "1px solid rgba(56,189,248,0.1)" }}>
        <Logo size={40} />
        <span className="text-base font-bold tracking-widest uppercase"
          style={{ background: "linear-gradient(90deg, #38bdf8, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Inventory
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        <div className="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "rgba(56,189,248,0.5)" }}>
          Navigation
        </div>
        {navigation.map((item, key) => {
          const IconComponent = item.icon;
          const isActive = currentPath === item.href;
          return (
            <Link
              href={item.href}
              key={key}
              className="flex items-center space-x-3 py-2.5 px-3 rounded-lg transition-all duration-200"
              style={isActive ? {
                background: "linear-gradient(90deg, rgba(56,189,248,0.15), rgba(168,85,247,0.1))",
                borderLeft: "2px solid #38bdf8",
                color: "#38bdf8",
              } : {
                color: "rgba(226,232,240,0.6)",
                borderLeft: "2px solid transparent",
              }}
            >
              <IconComponent className="w-4 h-4" />
              <span className="text-sm font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-6 py-5" style={{ borderTop: "1px solid rgba(56,189,248,0.1)" }}>
        <UserButton showUserInfo />
      </div>
    </div>
  );
}
