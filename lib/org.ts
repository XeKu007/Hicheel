import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { stackServerApp } from "@/stack/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { resolveLocale, type Locale } from "@/lib/i18n/index";

export type OrgRole = "SUPER_ADMIN" | "MANAGER" | "STAFF";

export interface OrgContext {
  organizationId: string;
  memberId: string;
  role: OrgRole;
  userId: string;
  orgName?: string;
  locale: Locale;
  userName?: string;
  userEmail?: string;
  userAvatar?: string | null;
}

export const ROLE_HIERARCHY: Record<OrgRole, number> = {
  STAFF: 0,
  MANAGER: 1,
  SUPER_ADMIN: 2,
};

const ORG_CONTEXT_TTL = 1800; // 30 minutes — matches Redis TTL.LONG

/**
 * Extracts userId from Stack Auth access token cookie without a network call.
 * Stack Auth stores ["refreshToken", "accessToken"] JSON in "stack-access" cookie.
 * The access token is a JWT with sub = userId.
 */
function getUserIdFromCookie(cookieStore: Awaited<ReturnType<typeof cookies>>): string | null {
  try {
    // Access token cookie: ["refreshToken", "accessToken"]
    const accessCookie = cookieStore.get("stack-access")?.value;
    const refreshCookieName = `stack-refresh-${process.env.NEXT_PUBLIC_STACK_PROJECT_ID ?? ""}`;
    const refreshToken = cookieStore.get(refreshCookieName)?.value;

    let accessToken: string | null = null;

    if (accessCookie?.startsWith('["') && refreshToken) {
      try {
        const parsed = JSON.parse(accessCookie) as unknown[];
        // Format: [refreshToken, accessToken] — only valid if refresh tokens match
        if (Array.isArray(parsed) && parsed[0] === refreshToken && typeof parsed[1] === "string") {
          accessToken = parsed[1];
        }
      } catch {}
    }

    // Fallback: maybe cookie is just the raw JWT string
    if (!accessToken && accessCookie && !accessCookie.startsWith("[") && accessCookie.includes(".")) {
      accessToken = accessCookie;
    }

    if (!accessToken) return null;

    // Decode JWT payload — no signature verification needed (middleware already validated cookie)
    const parts = accessToken.split(".");
    if (parts.length !== 3) return null;

    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;

    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function getOrgContext(): Promise<OrgContext> {
  // 1. Try middleware-injected x-user-id header first (fastest path, no JWT decode needed)
  let userId: string | null = null;
  try {
    const hdrs = await headers();
    userId = hdrs.get("x-user-id");
  } catch {}

  // 2. Fallback: extract userId from cookie JWT
  if (!userId) {
    try {
      const cookieStore = await cookies();
      userId = getUserIdFromCookie(cookieStore);
    } catch {}
  }

  if (userId) {
    // Try Redis cache — pipeline GET in one round-trip
    const cacheKey = `user:${userId}:orgContext`;
    try {
      const cached = await redis.get<OrgContext>(cacheKey);
      if (cached) return cached;
    } catch {}

    // Cache miss but we have userId — fetch Stack Auth + DB in parallel
    const [user, member] = await Promise.all([
      stackServerApp.getUser(),
      prisma.member.findFirst({
        where: { userId },
        include: { organization: { select: { id: true, name: true } } },
      }).catch(() => null),
    ]);

    if (!user) redirect("/sign-in");

    if (member && !member.organization) {
      await prisma.member.delete({ where: { id: member.id } }).catch(() => {});
      redirect("/onboarding");
    }
    if (!member) redirect("/onboarding");

    const ctx: OrgContext = {
      organizationId: member.organizationId,
      memberId: member.id,
      role: member.role as OrgRole,
      userId,
      orgName: member.organization?.name,
      locale: resolveLocale(member.locale),
      userName: user.displayName ?? undefined,
      userEmail: user.primaryEmail ?? undefined,
      userAvatar: user.profileImageUrl ?? null,
    };

    redis.setex(cacheKey, ORG_CONTEXT_TTL, ctx).catch(() => {});
    return ctx;
  }

  // 3. Last resort: call Stack Auth (userId unknown)
  const user = await stackServerApp.getUser();
  if (!user) redirect("/sign-in");
  userId = user.id;

  const cacheKey = `user:${userId}:orgContext`;

  // Try Redis again with confirmed userId
  try {
    const cached = await redis.get<OrgContext>(cacheKey);
    if (cached) return cached;
  } catch {}

  // Cache miss — fetch from DB
  // Wrap in try/catch to handle transient Supabase pooler connection errors gracefully
  let member;
  try {
    member = await prisma.member.findFirst({
      where: { userId },
      include: { organization: { select: { id: true, name: true } } },
    });
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    // P1001 = connection refused, P1002 = timeout — both are transient
    if (msg.includes("Can't reach database") || msg.includes("P1001") || msg.includes("P1002") || msg.includes("pool_timeout")) {
      console.error("[getOrgContext] Database connection error (transient):", msg);
      // Throw a user-friendly error instead of crashing with a raw Prisma error
      throw new Error("Database temporarily unavailable. Please refresh the page.");
    }
    throw dbErr;
  }

  if (member && !member.organization) {
    await prisma.member.delete({ where: { id: member.id } }).catch(() => {});
    redirect("/onboarding");
  }

  if (!member) redirect("/onboarding");

  const ctx: OrgContext = {
    organizationId: member.organizationId,
    memberId: member.id,
    role: member.role as OrgRole,
    userId,
    orgName: member.organization?.name,
    locale: resolveLocale(member.locale),
    userName: user.displayName ?? undefined,
    userEmail: user.primaryEmail ?? undefined,
    userAvatar: user.profileImageUrl ?? null,
  };

  // Cache — fire and forget
  redis.setex(cacheKey, ORG_CONTEXT_TTL, ctx).catch(() => {});

  return ctx;
}

export async function invalidateOrgContext(userId: string) {
  try {
    await redis.del(`user:${userId}:orgContext`);
  } catch {}
}

export function requireRole(ctx: OrgContext, required: OrgRole | OrgRole[]): void {
  const requiredRoles = Array.isArray(required) ? required : [required];
  const ctxLevel = ROLE_HIERARCHY[ctx.role];
  const hasPermission = requiredRoles.some(
    // eslint-disable-next-line security/detect-object-injection
    (r) => ctxLevel >= ROLE_HIERARCHY[r]
  );
  if (!hasPermission) {
    throw new Error(`Unauthorized: requires [${requiredRoles.join(", ")}], got ${ctx.role}`);
  }
}

export function hasRole(ctx: OrgContext, required: OrgRole): boolean {
  // eslint-disable-next-line security/detect-object-injection
  return ROLE_HIERARCHY[ctx.role] >= ROLE_HIERARCHY[required];
}
