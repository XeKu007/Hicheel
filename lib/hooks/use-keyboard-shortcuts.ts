"use client";

import { useEffect } from "react";

export interface ShortcutDefinition {
  key: string;
  description: string;
  action: () => void;
}

const KEYCODE_MAP: Record<number, string> = {
  78: "n",
  68: "d",
  65: "a",
  192: "`",
  191: "?",
};

export function useKeyboardShortcuts(shortcuts: ShortcutDefinition[]): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      // Skip if focused on input/textarea/contenteditable
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key ?? KEYCODE_MAP[e.keyCode] ?? "";

      for (const shortcut of shortcuts) {
        if (key.toLowerCase() === shortcut.key.toLowerCase()) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
