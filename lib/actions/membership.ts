"use server";

import { prisma } from "@/lib/prisma";
import { stackServerApp } from "@/stack/server";
import { getOrgContext, requireRole, invalidateOrgContext } from "@/lib/org";
import { invalidateCache } from "@/lib/redis";
import { MembershipAction, Role } from "@prisma/client";
import { writeAuditLog } from "@/lib/actions/audit";
import { checkPlanLimit, buildLimitError } from "@/lib/billing";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export interface MembershipRequestWithDetails {
  id: string;
  action: MembershipAction;
  status: string;
  newRole: Role | null;
  requesterId: string;
  requesterName: string | null;
  requesterEmail: string | null;
  targetUserId: string;
  targetName: string | null;
  targetEmail: string | null;
  createdAt: Date;
}

// ─── submitMembershipRequest ─────────────────────────────────────────────────

export async function submitMembershipRequest(
  formData: FormData
): Promise<ActionResult> {
  const ctx = await getOrgContext();

  const targetUserId = String(formData.get("targetUserId") || "");
  const action = String(formData.get("action") || "") as MembershipAction;
  const newRole = (formData.get("newRole") as Role | null) || null;

  if (!targetUserId || !action) {
    return { error: "Missing required fields." };
  }

  // Prevent self-targeting
  if (targetUserId === ctx.userId) {
    return { error: "You cannot submit a membership request targeting yourself." };
  }

  // Validate action value
  if (!["ADD", "REMOVE", "UPDATE_ROLE"].includes(action)) {
    return { error: "Invalid action type." };
  }

  // For UPDATE_ROLE, newRole is required
  if (action === "UPDATE_ROLE" && !newRole) {
    return { error: "New role is required for role update requests." };
  }

  // Check for duplicate request — prevent re-submitting for same action regardless of status
  const existing = await prisma.membershipRequest.findFirst({
    where: {
      organizationId: ctx.organizationId,
      targetUserId,
      action,
      status: { in: ["PENDING", "APPROVED"] },
    },
  });
  if (existing) {
    if (existing.status === "PENDING") {
      return { error: "A pending request for this member and action already exists." };
    }
    return { error: "This action has already been approved for this member." };
  }

  await prisma.membershipRequest.create({
    data: {
      organizationId: ctx.organizationId,
      requesterId: ctx.userId,
      targetUserId,
      action,
      newRole: action === "UPDATE_ROLE" ? newRole : null,
      status: "PENDING",
    },
  });

  return { success: true };
}

// ─── approveMembershipRequest ────────────────────────────────────────────────

export async function approveMembershipRequest(
  requestId: string
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  requireRole(ctx, "MANAGER");

  // Fetch request — must belong to this org
  type ReqWithOrg = {
    id: string; organizationId: string; status: string;
    action: string; targetUserId: string; newRole: import("@prisma/client").Role | null;
    organization: { stackTeamId: string };
  };
  const req = await prisma.membershipRequest.findFirst({
    where: { id: requestId, organizationId: ctx.organizationId, status: "PENDING" },
    include: { organization: true },
  }) as unknown as ReqWithOrg | null;
  if (!req) {
    return { error: "Request not found." };
  }

  try {
    // ── Plan limit: member count (only for ADD actions) ───────────────────
    if (req.action === "ADD") {
      const memberCount = await prisma.member.count({
        where: { organizationId: ctx.organizationId },
      });
      const memberCheck = await checkPlanLimit(ctx.organizationId, "members", memberCount);
      if (!memberCheck.allowed) {
        return buildLimitError("members", memberCheck.current, memberCheck.limit);
      }
    }

    // Step 1: DB transaction — only DB operations, no external calls
    await prisma.$transaction(async (tx) => {
      await tx.membershipRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED", approverId: ctx.userId, resolvedAt: new Date() },
      });

      if (req.action === "ADD") {
        await tx.member.upsert({
          where: { userId_organizationId: { userId: req.targetUserId, organizationId: ctx.organizationId } },
          create: { userId: req.targetUserId, organizationId: ctx.organizationId, role: req.newRole ?? "STAFF" },
          update: { role: req.newRole ?? "STAFF" },
        });
      } else if (req.action === "REMOVE") {
        await tx.member.deleteMany({
          where: { userId: req.targetUserId, organizationId: ctx.organizationId },
        });
      } else if (req.action === "UPDATE_ROLE" && req.newRole) {
        await tx.member.updateMany({
          where: { userId: req.targetUserId, organizationId: ctx.organizationId },
          data: { role: req.newRole },
        });
      }
    });

    // Step 2: Stack Auth sync — outside transaction (external network call)
    try {
      const team = await stackServerApp.getTeam(req.organization.stackTeamId);
      if (req.action === "ADD") {
        await team?.addUser(req.targetUserId);
      } else if (req.action === "REMOVE") {
        await team?.removeUser(req.targetUserId);
      }
    } catch (stackErr) {
      // Log but don't fail — DB is source of truth, Stack Auth is best-effort
      console.error("[approveMembershipRequest] Stack Auth sync failed:", stackErr);
    }

    await invalidateCache([
      `org:${ctx.organizationId}:members`,
      `org:${ctx.organizationId}:pending_requests`,
    ]);
    await invalidateOrgContext(req.targetUserId);

    // Audit log
    void writeAuditLog({
      organizationId: ctx.organizationId,
      actorMemberId: ctx.memberId,
      actorDisplayName: "",
      actionType: req.action === "UPDATE_ROLE" ? "ROLE_CHANGE" : "MEMBERSHIP",
      entityType: "Member",
      entityId: req.targetUserId,
      entityName: req.targetUserId,
      before: req.action === "UPDATE_ROLE" ? { role: "previous" } : null,
      after: req.action === "UPDATE_ROLE" ? { role: req.newRole } : { action: req.action },
    }).catch(() => {});

    return { success: true };
  } catch (err) {
    console.error("[approveMembershipRequest] Failed:", err);
    return { error: "Failed to approve request. Please try again." };
  }
}

// ─── rejectMembershipRequest ─────────────────────────────────────────────────

export async function rejectMembershipRequest(
  requestId: string
): Promise<ActionResult> {
  const ctx = await getOrgContext();
  requireRole(ctx, "MANAGER");

  const req = await prisma.membershipRequest.findFirst({
    where: { id: requestId, organizationId: ctx.organizationId, status: "PENDING" },
  });
  if (!req) {
    return { error: "Request not found." };
  }

  await prisma.membershipRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      approverId: ctx.userId,
      resolvedAt: new Date(),
    },
  });

  return { success: true };
}

// ─── getPendingRequests ──────────────────────────────────────────────────────

export async function getPendingRequests(): Promise<MembershipRequestWithDetails[]> {
  const ctx = await getOrgContext();
  requireRole(ctx, "MANAGER");

  const cacheKey = `org:${ctx.organizationId}:pending_requests`;

  const { redis } = await import("@/lib/redis");
  try {
    const cached = await redis.get<MembershipRequestWithDetails[]>(cacheKey);
    if (cached) return cached;
  } catch {}

  const requests = await prisma.membershipRequest.findMany({
    where: { organizationId: ctx.organizationId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  if (requests.length === 0) return [];

  // Fetch member profiles from DB instead of Stack Auth (much faster)
  const userIds = [...new Set(requests.flatMap((r) => [r.requesterId, r.targetUserId]))];
  const dbMembers = await prisma.member.findMany({
    where: { userId: { in: userIds }, organizationId: ctx.organizationId },
    select: { userId: true, displayName: true, email: true },
  });
  const profileMap = new Map(
    dbMembers.map((m) => [m.userId, { displayName: m.displayName, primaryEmail: m.email }])
  );

  const result = requests.map((r) => {
    const requester = profileMap.get(r.requesterId);
    const target = profileMap.get(r.targetUserId);
    return {
      id: r.id, action: r.action, status: r.status, newRole: r.newRole,
      requesterId: r.requesterId,
      requesterName: requester?.displayName ?? null,
      requesterEmail: requester?.primaryEmail ?? null,
      targetUserId: r.targetUserId,
      targetName: target?.displayName ?? null,
      targetEmail: target?.primaryEmail ?? null,
      createdAt: r.createdAt,
    };
  });

  try {
    await redis.setex(cacheKey, 30, JSON.stringify(result));
  } catch {}

  return result;
}
