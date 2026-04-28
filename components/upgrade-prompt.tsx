"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, ArrowUpRight, AlertTriangle } from "lucide-react";

interface UpgradePromptProps {
  resource: "members" | "categories" | "products";
  current: number;
  limit: number;
  dismissible?: boolean;
  variant?: "modal" | "banner";
}

const RESOURCE_LABELS: Record<string, string> = {
  members:    "team members",
  categories: "inventory categories",
  products:   "products",
};

const RESOURCE_DESCRIPTIONS: Record<string, string> = {
  members:    "Upgrade to Pro to invite unlimited team members.",
  categories: "Upgrade to Pro for unlimited inventory categories.",
  products:   "Upgrade to Pro to track unlimited products.",
};

function getResourceLabel(resource: "members" | "categories" | "products"): string {
  if (resource === "members") return RESOURCE_LABELS.members;
  if (resource === "categories") return RESOURCE_LABELS.categories;
  return RESOURCE_LABELS.products;
}

function getResourceDescription(resource: "members" | "categories" | "products"): string {
  if (resource === "members") return RESOURCE_DESCRIPTIONS.members;
  if (resource === "categories") return RESOURCE_DESCRIPTIONS.categories;
  return RESOURCE_DESCRIPTIONS.products;
}

export default function UpgradePrompt({
  resource,
  current,
  limit,
  dismissible = true,
  variant = "modal",
}: UpgradePromptProps) {
  const storageKey = `upgrade-prompt-dismissed-${resource}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (dismissible) {
      const dismissed = sessionStorage.getItem(storageKey);
      setVisible(!dismissed);
    } else {
      setVisible(true);
    }
  }, [dismissible, storageKey]);

  function dismiss() {
    if (dismissible) sessionStorage.setItem(storageKey, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const label = getResourceLabel(resource);
  const desc  = getResourceDescription(resource);

  if (variant === "banner") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "10px 16px",
        background: "rgba(200,240,0,0.06)",
        border: "1px solid rgba(200,240,0,0.2)",
        borderRadius: "var(--r-md)",
        fontSize: "12px",
      }}>
        <AlertTriangle size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span style={{ flex: 1, color: "var(--text-2)" }}>
          <strong style={{ color: "var(--text-1)" }}>
            {current}/{limit} {label}
          </strong>
          {" "}— {desc}
        </span>
        <Link
          href="/pricing"
          style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            padding: "4px 10px", borderRadius: "var(--r-sm)",
            background: "var(--accent)", color: "#000",
            fontSize: "11px", fontWeight: 700, textDecoration: "none",
            flexShrink: 0,
          }}
        >
          Upgrade <ArrowUpRight size={11} />
        </Link>
        {dismissible && (
          <button
            onClick={dismiss}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "2px", flexShrink: 0 }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  }

  // Modal variant
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={dismissible ? dismiss : undefined}
    >
      <div
        style={{
          width: "100%", maxWidth: "380px",
          background: "var(--bg-raised)",
          border: "1px solid var(--border-normal)",
          borderRadius: "var(--r-md)",
          padding: "28px 24px",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 11,
          background: "rgba(200,240,0,0.08)",
          border: "1px solid rgba(200,240,0,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 16,
        }}>
          <AlertTriangle size={20} style={{ color: "var(--accent)" }} />
        </div>

        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>
          {label.charAt(0).toUpperCase() + label.slice(1)} limit reached
        </div>

        <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 20 }}>
          Your Starter plan allows up to <strong style={{ color: "var(--text-1)" }}>{limit} {label}</strong>.
          You currently have <strong style={{ color: "var(--text-1)" }}>{current}</strong>.
          {" "}{desc}
        </div>

        {/* Usage bar */}
        <div style={{
          height: 4, background: "var(--bg-hover)",
          borderRadius: 99, overflow: "hidden", marginBottom: 20,
        }}>
          <div style={{
            height: "100%", borderRadius: 99,
            width: `${Math.min(100, (current / limit) * 100)}%`,
            background: current >= limit ? "var(--red)" : "var(--accent)",
          }} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/pricing"
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "9px 0", borderRadius: "var(--r-sm)",
              background: "var(--accent)", color: "#000",
              fontSize: 12, fontWeight: 700, textDecoration: "none",
            }}
          >
            Upgrade plan <ArrowUpRight size={12} />
          </Link>
          {dismissible && (
            <button
              onClick={dismiss}
              style={{
                flex: 1, padding: "9px 0", borderRadius: "var(--r-sm)",
                background: "transparent", border: "1px solid var(--border-normal)",
                color: "var(--text-2)", fontSize: 12, cursor: "pointer",
              }}
            >
              Maybe later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
