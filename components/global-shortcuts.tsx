"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useKeyboardShortcuts, type ShortcutDefinition } from "@/lib/hooks/use-keyboard-shortcuts";
import KeyboardShortcutPanel from "@/components/keyboard-shortcut-panel";

export default function GlobalShortcuts() {
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(false);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const shortcuts: ShortcutDefinition[] = useMemo(() => [
    {
      key: "n",
      description: "New product",
      action: () => router.push("/add-product"),
    },
    {
      key: "d",
      description: "Dispatch",
      action: () => router.push("/dispatch"),
    },
    {
      key: "a",
      description: "Alerts",
      action: () => router.push("/alerts"),
    },
    {
      key: "`",
      description: "Focus search",
      action: () => {
        const el = document.getElementById("inventory-search");
        if (el) {
          el.focus();
          (el as HTMLInputElement).select();
        }
      },
    },
    {
      key: "?",
      description: "Show shortcuts",
      action: () => setPanelOpen(true),
    },
  ], [router]);

  useKeyboardShortcuts(shortcuts);

  return panelOpen ? (
    <KeyboardShortcutPanel shortcuts={shortcuts} onClose={closePanel} />
  ) : null;
}
