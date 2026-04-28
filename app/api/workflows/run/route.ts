import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateWorkflowRules } from "@/lib/actions/ai/workflows";

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
        // skipOrgCheck=true: cron has no user session, org ownership verified by CRON_SECRET
        evaluateWorkflowRules(org.id, "CRON_SCHEDULE", {}, true).catch((err) => {
          console.error(`[workflows/run] Failed for org ${org.id}:`, err);
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[workflows/run] Failed:", err);
    return NextResponse.json({ error: "Workflow run failed" }, { status: 500 });
  }
}
