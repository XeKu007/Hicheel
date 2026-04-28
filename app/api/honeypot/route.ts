import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

/**
 * Honeypot endpoint — жинхэнэ хэрэглэгч хэзээ ч энд хандахгүй.
 * Хандсан бол автоматаар bot гэж тооцож IP-г блоклодог.
 *
 * Хэрэглэх газрууд:
 * 1. /api/honeypot — шууд хандалт (bot scanner-ууд энд орно)
 * 2. Form дахь нуугдмал field — bot автоматаар бөглөдөг
 */

const BLOCK_TTL = 3600; // 1 цаг блоклоно
const HONEYPOT_LOG_KEY = "honeypot:hits";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function blockIp(ip: string, reason: string): Promise<void> {
  try {
    const blockKey = `honeypot:blocked:${ip}`;
    const logEntry = JSON.stringify({
      ip,
      reason,
      path: "/api/honeypot",
      timestamp: new Date().toISOString(),
    });

    await redis.pipeline()
      .setex(blockKey, BLOCK_TTL, "1")
      .lpush(HONEYPOT_LOG_KEY, logEntry)
      .ltrim(HONEYPOT_LOG_KEY, 0, 999)
      .exec();
  } catch {
    console.warn(`[honeypot] Failed to block IP ${ip}: Redis unavailable`);
  }
}

// GET — bot scanner-ууд энд орно
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  await blockIp(ip, "GET /api/honeypot — bot scanner detected");
  console.warn(`[honeypot] Blocked IP ${ip} — accessed honeypot endpoint`);
  return new NextResponse("OK", { status: 200 });
}

// POST — form honeypot field бөглөгдсөн үед
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // JSON биш — bot
  }

  const reason = body.source === "form-honeypot"
    ? "Form honeypot field filled — bot detected"
    : "POST /api/honeypot — bot detected";

  await blockIp(ip, reason);
  console.warn(`[honeypot] Blocked IP ${ip} — ${reason}`);
  return NextResponse.json({ ok: true }, { status: 200 });
}
