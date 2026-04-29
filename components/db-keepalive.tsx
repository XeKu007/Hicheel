"use client";

import { useEffect, useRef } from "react";

const INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

/**
 * Silently pings /api/keepalive every 4 minutes to prevent Supabase
 * free-tier database cold starts.
 */
export default function DbKeepalive() {
  const activeRef = useRef(false);

  useEffect(() => {
    // Prevent double-mount in React StrictMode
    if (activeRef.current) return;
    activeRef.current = true;

    function ping() {
      fetch("/api/keepalive", { cache: "no-store" }).catch(() => {});
    }

    ping();
    const id = setInterval(ping, INTERVAL_MS);

    return () => {
      clearInterval(id);
      activeRef.current = false;
    };
  }, []);

  return null;
}
