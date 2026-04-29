import { type NextRequest, NextResponse } from "next/server";
import { stackServerApp } from "@/stack/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import type { OrgContext } from "@/lib/org";

/**
 * Called by Stack Auth afterSignIn redirect.
 * Warms the Redis org context cache then redirects to dashboard or onboarding.
 * Does NOT call getOrgContext() to avoid redirect loops.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  try {
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/sign-in`);
    }

    // Check if user has a member record
    const member = await prisma.member.findFirst({
      where: { userId: user.id },
      include: { organization: { select: { id: true, name: true } } },
    });

    if (!member || !member.organization) {
      // No org — go to onboarding regardless of return_to
      return NextResponse.redirect(`${origin}/onboarding`);
    }

    // Warm Redis cache
    const { resolveLocale } = await import("@/lib/i18n/index");
    const ctx: OrgContext = {
      organizationId: member.organizationId,
      memberId: member.id,
      role: member.role as OrgContext["role"],
      userId: user.id,
      orgName: member.organization.name,
      locale: resolveLocale(member.locale),
      userName: user.displayName ?? undefined,
      userEmail: user.primaryEmail ?? undefined,
      userAvatar: user.profileImageUrl ?? null,
    };
    redis.setex(`user:${user.id}:orgContext`, 1800, ctx).catch(() => {});

    // Only honor return_to if user has an org (otherwise loop risk)
    const returnTo = request.nextUrl.searchParams.get("after_auth_return_to");
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      return NextResponse.redirect(`${origin}${returnTo}`);
    }

    return NextResponse.redirect(`${origin}/dashboard`);
  } catch {
    return NextResponse.redirect(`${origin}/dashboard`);
  }
}
