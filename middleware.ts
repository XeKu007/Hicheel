import { NextRequest, NextResponse } from "next/server";

// Stack Auth cookie names — NEXT_PUBLIC_ vars are inlined at build time
const STACK_REFRESH_COOKIE = `stack-refresh-${process.env.NEXT_PUBLIC_STACK_PROJECT_ID ?? ""}`;

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/inventory",
  "/add-product",
  "/settings",
  "/org",
  "/alerts",
  "/dispatch",
  "/leaderboard",
  "/reorder",
  "/workflows",
  "/agent",
  "/ai",
  "/admin",
  "/onboarding",
];

// ── App-level WAF ─────────────────────────────────────────────────────────────
// Edge-compatible pattern matching — no regex backtracking, fixed-length checks

/** SQL injection indicators — common keywords in URL/query params */
const SQL_PATTERNS = [
  "union select", "union+select",
  "' or '1'='1", "' or 1=1",
  "drop table", "drop+table",
  "insert into", "delete from",
  "exec(", "execute(",
  "xp_cmdshell", "sp_executesql",
  "--", "/*", "*/",
  "0x", "char(", "nchar(",
];

/** XSS indicators */
const XSS_PATTERNS = [
  "<script", "</script>",
  "javascript:", "vbscript:",
  "onload=", "onerror=", "onclick=",
  "eval(", "expression(",
  "document.cookie", "document.write",
  "window.location",
];

/** Path traversal indicators */
const PATH_TRAVERSAL_PATTERNS = [
  "../", "..\\",
  "%2e%2e%2f", "%2e%2e/", "..%2f",
  "%252e%252e", "....//",
];

/** Max URL length — prevents buffer overflow attempts */
const MAX_URL_LENGTH = 2048;

/** Max header value length */
const MAX_HEADER_LENGTH = 8192;

function detectWafThreat(request: NextRequest): boolean {
  const url = request.url.toLowerCase();

  // 1. URL length check
  if (url.length > MAX_URL_LENGTH) return true;

  // 2. Path traversal in URL
  for (const p of PATH_TRAVERSAL_PATTERNS) {
    if (url.includes(p)) return true;
  }

  // 3. SQL injection in query string
  const qs = request.nextUrl.search.toLowerCase();
  if (qs) {
    for (const p of SQL_PATTERNS) {
      if (qs.includes(p)) return true;
    }
    for (const p of XSS_PATTERNS) {
      if (qs.includes(p)) return true;
    }
  }

  // 4. Suspicious User-Agent (scanners, exploit tools)
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  if (
    ua.includes("sqlmap") ||
    ua.includes("nikto") ||
    ua.includes("nessus") ||
    ua.includes("masscan") ||
    ua.includes("zgrab") ||
    ua.includes("nuclei") ||
    ua.includes("acunetix") ||
    ua.includes("burpsuite") ||
    (ua.length > 0 && ua.length < 10) // suspiciously short UA
  ) return true;

  // 5. Oversized headers
  for (const [, value] of request.headers.entries()) {
    if (value.length > MAX_HEADER_LENGTH) return true;
  }

  return false;
}

/** Decode JWT payload without signature verification (edge-safe, no crypto) */
function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    const payload = JSON.parse(json) as Record<string, unknown>;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Honeypot-д блоклогдсон IP эсэхийг шалгана.
 * Upstash REST API-г шууд дуудна — Edge runtime-д Node.js module хэрэггүй.
 */
async function isHoneypotBlocked(ip: string): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const res = await fetch(`${url}/get/honeypot:blocked:${encodeURIComponent(ip)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return false;
    const data = await res.json() as { result: string | null };
    return data.result === "1";
  } catch {
    return false;
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ── WAF check — runs before everything else ───────────────────────────────
  if (detectWafThreat(request)) {
    const clientIp = getClientIp(request);
    // Never block localhost — dev environment
    const isLocalhost = clientIp === "::1" || clientIp === "127.0.0.1" || clientIp === "unknown";
    if (!isLocalhost) {
      console.warn(`[WAF] Blocked suspicious request: ${request.method} ${pathname} ip=${clientIp}`);
      return new NextResponse("Bad Request", { status: 400 });
    }
  }

  // ── Honeypot IP блок шалгалт — зөвхөн API болон POST request-д ─────────────
  const ip = getClientIp(request);
  const isApiOrPost = pathname.startsWith("/api/") || request.method === "POST";
  if (ip !== "unknown" && isApiOrPost) {
    const blocked = await isHoneypotBlocked(ip);
    if (blocked) {
      // Блоклогдсон IP-д хуурамч 404 буцаана — bot-д мэдэгдэхгүй
      return new NextResponse("Not Found", { status: 404 });
    }
  }

  const refreshToken = request.cookies.get(STACK_REFRESH_COOKIE)?.value;
  const accessCookie = request.cookies.get("stack-access")?.value;
  const isLoggedIn = !!(refreshToken || accessCookie);

  // Redirect logged-in users away from landing/auth pages — makes them static (fast LCP)
  if (pathname === "/" && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if ((pathname === "/sign-in" || pathname === "/sign-up") && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  if (!refreshToken && !accessCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("after_auth_return_to", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Decode userId from access token and pass as header — avoids Stack Auth network call in getOrgContext
  const response = NextResponse.next();
  let userId: string | null = null;

  if (accessCookie && refreshToken) {
    try {
      // Format: ["refreshToken", "accessToken"]
      if (accessCookie.startsWith('["')) {
        const parsed = JSON.parse(accessCookie) as unknown[];
        if (Array.isArray(parsed) && parsed[0] === refreshToken && typeof parsed[1] === "string") {
          userId = decodeJwtSub(parsed[1]);
        }
      } else if (accessCookie.includes(".")) {
        userId = decodeJwtSub(accessCookie);
      }
    } catch {}
  }

  if (userId) {
    response.headers.set("x-user-id", userId);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/sign-in",
    "/sign-up",
    "/dashboard/:path*",
    "/inventory/:path*",
    "/add-product/:path*",
    "/settings/:path*",
    "/org/:path*",
    "/alerts/:path*",
    "/dispatch/:path*",
    "/leaderboard/:path*",
    "/reorder/:path*",
    "/workflows/:path*",
    "/agent/:path*",
    "/ai/:path*",
    "/admin/:path*",
    "/onboarding/:path*",
    "/onboarding",
    // Honeypot endpoint — always check
    "/api/honeypot",
  ],
};
