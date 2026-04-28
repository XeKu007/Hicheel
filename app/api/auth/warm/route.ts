import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org";

/**
 * Called client-side right after sign-in to warm the Redis org context cache.
 * This way when the user lands on /dashboard, getOrgContext() hits Redis (~20ms)
 * instead of calling Stack Auth + DB (~500ms).
 */
export async function POST() {
  try {
    await getOrgContext();
    return NextResponse.json({ ok: true });
  } catch {
    // Ignore errors — this is best-effort cache warming
    return NextResponse.json({ ok: false });
  }
}
