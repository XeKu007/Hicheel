"use client";

import { useState, useEffect } from "react";

export type ViewMode = "table" | "gallery";

export function useViewPreference(key = "inventory-view"): [ViewMode, (v: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>("table");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === "gallery" || stored === "table") {
        setMode(stored);
      }
    } catch {}
  }, [key]);

  function setAndStore(v: ViewMode) {
    setMode(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  }

  return [mode, setAndStore];
}
