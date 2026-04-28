import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAgentScan } from "@/lib/actions/ai/agent";

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
        runAgentScan(org.id).catch((err) => {
          console.error(`[agent/run] Failed for org ${org.id}:`, err);
        })
      )
    );

    return NextResponse.json({ success: true, orgsProcessed: orgs.length });
  } catch (err) {
    console.error("[agent/run] Failed:", err);
    return NextResponse.json({ error: "Agent scan failed" }, { status: 500 });
  }
}
