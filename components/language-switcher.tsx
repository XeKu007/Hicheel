"use client";

import { useRouter } from "next/navigation";
import { setLocale } from "@/lib/actions/locale";
import type { Locale } from "@/lib/i18n/index";

interface LanguageSwitcherProps {
  locale: string;
  compact?: boolean;
}

export function LanguageSwitcher({ locale, compact }: LanguageSwitcherProps) {
  const router = useRouter();
  const isEN = locale === "en";

  async function handleToggle() {
    const next: Locale = isEN ? "mn" : "en";
    const result = await setLocale(next);
    if (result.error) {
      console.error("[LanguageSwitcher] setLocale failed:", result.error);
      return;
    }
    router.refresh();
  }

  if (compact) {
    return (
      <button
        onClick={handleToggle}
        className="rail-icon"
        title={`Switch to ${isEN ? "Mongolian" : "English"}`}
        aria-label={`Switch language to ${isEN ? "Mongolian" : "English"}`}
        style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
      >
        {isEN ? "MN" : "EN"}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dim)",
        borderRadius: "var(--r-sm)",
        padding: "4px 8px",
        cursor: "pointer",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.05em",
        display: "flex",
        alignItems: "center",
        gap: "3px",
        color: "var(--text-2)",
        fontFamily: "var(--font-mono)",
      }}
      aria-label={`Switch language to ${isEN ? "Mongolian" : "English"}`}
    >
      <span style={{ color: isEN ? "var(--accent)" : "var(--text-3)" }}>EN</span>
      <span style={{ color: "var(--border-normal)" }}>/</span>
      <span style={{ color: !isEN ? "var(--accent)" : "var(--text-3)" }}>MN</span>
    </button>
  );
}
