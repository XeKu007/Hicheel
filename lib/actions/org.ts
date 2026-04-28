"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { stackServerApp } from "@/stack/server";
import { getOrgContext, requireRole, invalidateOrgContext } from "@/lib/org";
import { invalidateCache } from "@/lib/redis";
import { SUPPORTED_CURRENCIES } from "@/lib/i18n/currency";

// ─── Validation ──────────────────────────────────────────────────────────────

const OrgNameSchema = z
  .string()
  .trim()
  .min(1, "Organization name is required")
  .max(100, "Organization name must be 100 characters or less");

const CurrencySchema = z.enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]]);

const EmailSchema = z.string().email("Invalid email address");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemberWithProfile {
  id: string;
  userId: string;
  role: string;
  displayName: string | null;
  email: string | null;
  createdAt: Date;
}

export interface ActionResult {
  error?: string;
  success?: boolean;
}

// ─── createOrganization ──────────────────────────────────────────────────────

export async function createOrganization(
  formData: FormData
): Promise<ActionResult> {
  // Get current user
  const user = await stackServerApp.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Validate org name
  const nameResult = OrgNameSchema.safeParse(formData.get("name"));
  if (!nameResult.success) {
    return { error: nameResult.error.issues[0].message };
  }
  const name = nameResult.data;

  // Check if user already has a MANAGER role in any org
  const existingManager = await prisma.member.findFirst({
    where: { userId: user.id, role: "MANAGER" },
  });
  if (existingManager) {
    return {
      error: "You are already a manager of an organization. You cannot create another one.",
    };
  }

  // Create Stack Auth team
  let stackTeam: { id: string };
  try {
    stackTeam = await stackServerApp.createTeam({ displayName: name });
  } catch (err) {
    console.error("[createOrganization] Stack Auth team creation failed:", err);
    return { error: "Failed to create organization. Please try again." };
  }

  // Create Organization + Member in a transaction
  try {
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name,
          stackTeamId: stackTeam.id,
        },
      });
      await tx.member.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: "MANAGER",
          displayName: user.displayName ?? null,
          email: user.primaryEmail ?? null,
        },
      });
    });
  } catch (err) {
    // Rollback: delete the Stack Auth team to avoid orphans
    try {
      const team = await stackServerApp.getTeam(stackTeam.id);
      await team?.delete();
    } catch (rollbackErr) {
      console.error("[createOrganization] Stack Auth rollback failed:", rollbackErr);
    }
    console.error("[createOrganization] Prisma transaction failed:", err);
    return { error: "Failed to save organization. Please try again." };
  }

  redirect("/dashboard");
}

// ─── inviteMember ────────────────────────────────────────────────────────────

export async function inviteMember(
  formData: FormData
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  requireRole(ctx, "MANAGER");

  // Validate email
  const emailResult = EmailSchema.safeParse(formData.get("email"));
  if (!emailResult.success) {
    return { error: emailResult.error.issues[0].message };
  }
  const email = emailResult.data.toLowerCase();

  // Check for duplicate pending invitation
  const existingInvite = await prisma.invitation.findUnique({
    where: { email_organizationId: { email, organizationId: ctx.organizationId } },
  });
  if (existingInvite && existingInvite.status === "PENDING") {
    return { error: "An invitation has already been sent to this email address." };
  }

  // Check if already a member — use invitation table instead of Stack Auth loop
  const existingMemberByEmail = await prisma.invitation.findFirst({
    where: { email, organizationId: ctx.organizationId, status: "ACCEPTED" },
  });
  if (existingMemberByEmail) {
    return { error: "This user is already a member of your organization." };
  }

  // Save invitation to DB only (no Stack Auth email)
  await prisma.invitation.upsert({
    where: { email_organizationId: { email, organizationId: ctx.organizationId } },
    create: {
      email,
      organizationId: ctx.organizationId,
      status: "PENDING",
    },
    update: {
      status: "PENDING",
    },
  });

  return { success: true };
}

// ─── getPendingInvitesForUser ─────────────────────────────────────────────────
// Called from onboarding page — shows pending invites for the current user's email

export async function getPendingInvitesForUser(): Promise<
  { id: string; orgName: string; organizationId: string; createdAt: Date }[]
> {
  const user = await stackServerApp.getUser();
  if (!user?.primaryEmail) return [];

  const email = user.primaryEmail.toLowerCase();

  type InviteWithOrg = { id: string; organizationId: string; createdAt: Date; organization: { name: string } };
  const invites = await prisma.invitation.findMany({
    where: { email, status: "PENDING" },
    include: { organization: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  }) as unknown as InviteWithOrg[];

  return invites.map((inv) => ({
    id: inv.id,
    orgName: inv.organization.name,
    organizationId: inv.organizationId,
    createdAt: inv.createdAt,
  }));
}

// ─── acceptInvite ─────────────────────────────────────────────────────────────

export async function acceptInvite(inviteId: string): Promise<ActionResult> {
  const user = await stackServerApp.getUser();
  if (!user?.primaryEmail) return { error: "Not authenticated." };

  const email = user.primaryEmail.toLowerCase();

  const invite = await prisma.invitation.findFirst({
    where: { id: inviteId, email, status: "PENDING" },
  });

  if (!invite) {
    return { error: "Invitation not found or already used." };
  }

  // Create Member record + mark invite accepted
  await prisma.$transaction(async (tx) => {
    await tx.member.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: invite.organizationId,
        },
      },
      create: {
        userId: user.id,
        organizationId: invite.organizationId,
        role: "STAFF",
        displayName: user.displayName ?? null,
        email: user.primaryEmail ?? null,
      },
      update: {
        displayName: user.displayName ?? null,
        email: user.primaryEmail ?? null,
      },
    });

    await tx.invitation.update({
      where: { id: inviteId },
      data: { status: "ACCEPTED" },
    });
  });

  await invalidateCache([`org:${invite.organizationId}:*`, `org:${invite.organizationId}:members`]);
  await invalidateOrgContext(user.id);

  redirect("/dashboard");
}

// ─── getMembers ──────────────────────────────────────────────────────────────

export async function getMembers(): Promise<MemberWithProfile[]> {
  const ctx = await getOrgContext();
  requireRole(ctx, "STAFF");

  const cacheKey = `org:${ctx.organizationId}:members`;

  try {
    const { redis } = await import("@/lib/redis");
    const cached = await redis.get<MemberWithProfile[]>(cacheKey);
    if (cached) return cached;
  } catch {}

  const members = await prisma.member.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, role: true, displayName: true, email: true, createdAt: true },
  });

  // Only fetch from Stack Auth if members are missing profile data
  // Do this fire-and-forget to not block the response
  const needsUpdate = members.filter((m) => !m.displayName && !m.email);
  if (needsUpdate.length > 0) {
    // Fire-and-forget: update DB in background, don't block response
    // Snapshot the IDs to avoid mutating the array that's already been mapped
    const idsToUpdate = needsUpdate.map(m => m.id);
    void (async () => {
      try {
        const profiles = await Promise.allSettled(
          needsUpdate.map((m) => stackServerApp.getUser(m.userId))
        );
        await Promise.allSettled(
          needsUpdate.map(async (m, i) => {
            // eslint-disable-next-line security/detect-object-injection
            const res = profiles[i];
            const u = res.status === "fulfilled" ? res.value : null;
            if (u) {
              await prisma.member.update({
                where: { id: m.id },
                data: { displayName: u.displayName ?? null, email: u.primaryEmail ?? null },
              });
            }
          })
        );
        // Invalidate cache so next request gets fresh data
        const { redis: r } = await import("@/lib/redis");
        await r.del(`org:${ctx.organizationId}:members`).catch(() => {});
      } catch {}
      void idsToUpdate; // suppress unused warning
    })();
  }

  const result: MemberWithProfile[] = members.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    displayName: m.displayName,
    email: m.email,
    createdAt: m.createdAt,
  }));

  try {
    const { redis } = await import("@/lib/redis");
    await redis.setex(cacheKey, 120, result);
  } catch {}

  return result;
}

// ─── removeMemberRequest ─────────────────────────────────────────────────────
// Submits a REMOVE membership request (goes through approval workflow)

export async function removeMemberRequest(
  targetUserId: string
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  requireRole(ctx, "MANAGER");

  if (targetUserId === ctx.userId) {
    return { error: "You cannot remove yourself from the organization." };
  }

  // Check target is actually a member
  const target = await prisma.member.findFirst({
    where: { userId: targetUserId, organizationId: ctx.organizationId },
  });
  if (!target) {
    return { error: "Member not found in your organization." };
  }

  // Check for duplicate pending request
  const existing = await prisma.membershipRequest.findFirst({
    where: {
      organizationId: ctx.organizationId,
      targetUserId,
      action: "REMOVE",
      status: "PENDING",
    },
  });
  if (existing) {
    return { error: "A removal request is already pending for this member." };
  }

  await prisma.membershipRequest.create({
    data: {
      organizationId: ctx.organizationId,
      requesterId: ctx.userId,
      targetUserId,
      action: "REMOVE",
      status: "PENDING",
    },
  });

  return { success: true };
}

// ─── updateOrgCurrency ───────────────────────────────────────────────────────

export async function updateOrgCurrency(
  formData: FormData
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  requireRole(ctx, "MANAGER");

  const currencyResult = CurrencySchema.safeParse(formData.get("currency"));
  if (!currencyResult.success) {
    return { error: "Unsupported currency code." };
  }

  await prisma.organization.update({
    where: { id: ctx.organizationId },
    data: { currency: currencyResult.data },
  });

  await invalidateOrgContext(ctx.userId);

  return { success: true };
}

// ─── deleteOrganization ──────────────────────────────────────────────────────

export async function deleteOrganization(): Promise<ActionResult> {
  const ctx = await getOrgContext();
  requireRole(ctx, "MANAGER");

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
  });
  if (!org) {
    return { error: "Organization not found." };
  }

  // Delete Stack Auth team
  try {
    const team = await stackServerApp.getTeam(org.stackTeamId);
    await team?.delete();
  } catch (err) {
    console.error("[deleteOrganization] Stack Auth team delete failed:", err);
    // Continue with DB deletion even if Stack Auth fails
  }

  // Delete org — cascade deletes Members, Products, Invitations, MembershipRequests
  await prisma.organization.delete({
    where: { id: ctx.organizationId },
  });

  // Invalidate all org cache
  await invalidateCache([`org:${ctx.organizationId}:*`]);

  redirect("/onboarding");
}
