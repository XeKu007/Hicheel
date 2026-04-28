"use client";

import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";

interface ExportButtonProps {
  isManager?: boolean;
}

export default function ExportButton({ isManager = false }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  if (!isManager) return null;

  const options = [
    { type: "activity", label: "Last 30 days activity log" },
    { type: "daily", label: "Today's activity" },
    { type: "inventory", label: "Current inventory" },
  ];

  async function handleExport(type: string) {
    setOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/export?type=${type}`);
      if (res.status === 403) { alert("Only managers can export data."); return; }
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      a.download = cd.split('filename="')[1]?.replace('"', "") ?? `${type}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        className="btn-ghost"
        style={{ opacity: loading ? 0.5 : 1 }}
      >
        <Download style={{ width: "13px", height: "13px" }} />
        {loading ? "Exporting..." : "Export"}
        <ChevronDown style={{ width: "11px", height: "11px" }} />
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="card" style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
            minWidth: "200px", overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            {options.map((opt, i) => (
              <button
                key={opt.type}
                onClick={() => handleExport(opt.type)}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "9px 14px", fontSize: "12px",
                  color: "var(--text-1)", background: "transparent",
                  border: "none", borderBottom: i < options.length - 1 ? "1px solid var(--border-dim)" : "none",
                  cursor: "pointer", display: "block",
                  transition: "background 0.08s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
