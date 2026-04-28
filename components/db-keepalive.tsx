"use client";

import { useEffect } from "react";

const INTERVAL_MS = 4 * 60 * 1000; // 4 minutes — Supabase free tier sleeps after 5 min

/**
 * Silently pings /api/keepalive every 4 minutes to prevent Supabase
 * free-tier database cold starts (which cause 3-10s page load delays).
 */
export default function DbKeepalive() {
  useEffect(() => {
    // Ping immediately on mount, then every 4 minutes
    function ping() {
      fetch("/api/keepalive", { cache: "no-store" }).catch(() => {});
    }

    ping();
    const id = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
