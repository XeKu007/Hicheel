"use client";

import { useEffect } from "react";
import type { ShortcutDefinition } from "@/lib/hooks/use-keyboard-shortcuts";

interface KeyboardShortcutPanelProps {
  shortcuts: ShortcutDefinition[];
  onClose: () => void;
}

export default function KeyboardShortcutPanel({ shortcuts, onClose }: KeyboardShortcutPanelProps) {
  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-normal)",
          borderRadius: "var(--r-md)",
          padding: 24,
          minWidth: 320,
          maxWidth: 400,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Keyboard Shortcuts</div>
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: "3px 8px", fontSize: 11 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.key} style={{ borderBottom: "1px solid var(--border-dim)" }}>
                <td style={{ padding: "8px 0", width: 48 }}>
                  <kbd style={{
                    display: "inline-block",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-normal)",
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--accent)",
                    minWidth: 28,
                    textAlign: "center",
                  }}>
                    {s.key === "`" ? "` " : s.key.toUpperCase()}
                  </kbd>
                </td>
                <td style={{ padding: "8px 0 8px 12px", fontSize: 12, color: "var(--text-2)" }}>
                  {s.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 14, fontSize: 10, color: "var(--text-3)", textAlign: "center" }}>
          Press <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
