import { NextRequest, NextResponse } from "next/server";

/**
 * CORS — зөвхөн өөрийн домэйнаас ирэх хүсэлтийг зөвшөөрнө.
 * Browser-аас ирэх cross-origin API дуудлагыг хориглодог.
 */
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export function corsHeaders(origin: string | null): Record<string, string> {
  // Same-origin эсвэл зөвшөөрөгдсөн origin-д л CORS header өгнө
  const allowed = origin === ALLOWED_ORIGIN || !origin;
  return {
    "Access-Control-Allow-Origin": allowed ? (origin ?? ALLOWED_ORIGIN) : "null",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/** OPTIONS preflight хүсэлтэд хариулна */
export function handleCorsOptions(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

/**
 * Safe error response — stack trace, DB message, internal detail-ийг
 * хэзээ ч client-д буцаахгүй. Зөвхөн log-д бичнэ.
 */
export function safeErrorResponse(
  err: unknown,
  context: string,
  status = 500,
  publicMessage = "An error occurred. Please try again."
): NextResponse {
  // Internal detail-ийг log-д бичнэ
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${context}]`, detail);

  // Client-д зөвхөн ерөнхий мессеж буцаана
  return NextResponse.json({ error: publicMessage }, { status });
}

/**
 * CSV formula injection sanitization.
 * =, +, -, @, TAB, CR-ээр эхэлсэн утгыг апостроф нэмж саармагжуулна.
 * Spreadsheet application-ууд эдгээрийг formula гэж тайлбарладаг.
 */
export function sanitizeCsvValue(value: string | number | null): string | number | null {
  if (typeof value !== "string") return value;
  // Formula injection trigger characters
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}
