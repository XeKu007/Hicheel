import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await getOrgContext();
    const channel = `org:${ctx.organizationId}:inventory:updates`;
    const encoder = new TextEncoder();

    let interval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const stream = new ReadableStream({
      async start(controller) {
        function safeClose() {
          if (closed) return;
          closed = true;
          if (interval) clearInterval(interval);
          if (timeout) clearTimeout(timeout);
          try { controller.close(); } catch {}
        }

        // Send initial ping
        try {
          controller.enqueue(encoder.encode("data: {\"type\":\"connected\"}\n\n"));
        } catch {
          safeClose();
          return;
        }

        // Poll Redis every 2 seconds
        interval = setInterval(async () => {
          if (closed) return;
          try {
            const msg = await redis.lpop<string>(channel);
            if (msg && !closed) {
              // msg is already a JSON string from Redis — send directly without re-serializing
              controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
            }
            // Keep-alive ping
            if (!closed) {
              controller.enqueue(encoder.encode(": ping\n\n"));
            }
          } catch {
            safeClose();
          }
        }, 2000);

        // Close after 25 seconds
        timeout = setTimeout(safeClose, 25000);
      },
      cancel() {
        closed = true;
        if (interval) clearInterval(interval);
        if (timeout) clearTimeout(timeout);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
