import { NextResponse } from "next/server";
import { promRegistry } from "@/lib/metrics";

export async function GET(request: Request) {
  const auth = request.headers.get("Authorization");
  const secret = process.env.METRICS_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const output = await promRegistry.metrics();
    return new Response(output, {
      headers: { "Content-Type": promRegistry.contentType },
    });
  } catch {
    return NextResponse.json({ error: "Failed to collect metrics" }, { status: 500 });
  }
}
