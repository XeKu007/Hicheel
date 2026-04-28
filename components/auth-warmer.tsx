"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@stackframe/stack";

/**
 * Warms the Redis org context cache right after sign-in.
 * Fires a POST to /api/auth/warm once per session when user becomes authenticated.
 */
export default function AuthWarmer() {
  const user = useUser();
  const warmed = useRef(false);

  useEffect(() => {
    if (user && !warmed.current) {
      warmed.current = true;
      // Fire-and-forget — warm the cache in background
      fetch("/api/auth/warm", { method: "POST" }).catch(() => {});
    }
  }, [user]);

  return null;
}
