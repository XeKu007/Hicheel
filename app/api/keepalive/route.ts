import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Lightweight DB ping to prevent Supabase free-tier cold starts.
 * Called every 4 minutes from the client to keep the connection pool warm.
 * Uses SELECT 1 — the cheapest possible query.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
