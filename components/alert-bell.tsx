"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function AlertBell({ initialCount = 0 }: { initialCount?: number }) {
  const [count, setCount] = useState(initialCount);

  // Poll unread count every 30s to keep bell in sync
  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    let abortController: AbortController | null = null;

    async function fetchCount() {
      abortController = new AbortController();
      try {
        const res = await fetch("/api/alerts/unread-count", {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (res.ok) {
          const data = await res.json() as { count: number };
          setCount(data.count ?? 0);
        }
      } catch (err) {
        // AbortError is expected on cleanup — ignore silently
        if (err instanceof Error && err.name !== "AbortError") {
          console.warn("[AlertBell] fetch failed:", err.message);
        }
      }
    }

    // Fetch immediately on mount, then every 5 minutes
    void fetchCount();
    const interval = setInterval(() => { void fetchCount(); }, 5 * 60_000);

    return () => {
      abortController?.abort();
      clearInterval(interval);
    };
  }, []);

  return (
    <Link
      href="/alerts"
      className="rail-icon"
      title={count > 0 ? `${count} unread alert${count !== 1 ? "s" : ""}` : "Alerts"}
      aria-label={count > 0 ? `${count} unread alerts` : "Alerts"}
      style={{ position: "relative" }}
    >
      <Bell size={15} strokeWidth={1.6} />
      {count > 0 && (
        <span style={{
          position: "absolute",
          top: "4px", right: "4px",
          width: "5px", height: "5px",
          borderRadius: "50%",
          background: "var(--accent)",
          display: "block",
        }} />
      )}
    </Link>
  );
}
