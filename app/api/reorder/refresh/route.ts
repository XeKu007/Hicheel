import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeReorderSuggestions } from "@/lib/actions/ai/reorder";

export async function POST(request: Request) {
  const auth = request.headers.get("Authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const orgs = await prisma.organization.findMany({
      select: { id: true },
    });

    await Promise.allSettled(
      orgs.map((org) =>
        computeReorderSuggestions(org.id).catch((err) => {
          console.error(`[reorder/refresh] Failed for org ${org.id}:`, err);
        })
      )
    );

    return NextResponse.json({ success: true, orgsProcessed: orgs.length });
  } catch (err) {
    console.error("[reorder/refresh] Failed:", err);
    return NextResponse.json({ error: "Reorder refresh failed" }, { status: 500 });
  }
}
