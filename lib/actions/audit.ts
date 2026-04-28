"use server";

import { prisma } from "@/lib/prisma";
import { getOrgContext, requireRole } from "@/lib/org";

export type AuditActionType = "CREATE" | "UPDATE" | "DELETE" | "ROLE_CHANGE" | "MEMBERSHIP";
export type AuditEntityType = "Product" | "Member" | "Invitation";

export interface AuditLogEntry {
  id: string;
  organizationId: string;
  actorMemberId: string;
  actorDisplayName: string;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  entityName: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: Date;
}

export async function writeAuditLog(
  entry: Omit<AuditLogEntry, "id" | "createdAt">
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        actorMemberId: entry.actorMemberId,
        actorDisplayName: entry.actorDisplayName,
        actionType: entry.actionType,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityName: entry.entityName,
        before: entry.before ? (entry.before as object) : undefined,
        after: entry.after ? (entry.after as object) : undefined,
      },
    });
  } catch (err) {
    console.error("[writeAuditLog] Failed to write audit log:", err);
  }
}

export async function getAuditLogs(params: {
  cursor?: string;
  limit?: number;
  actorMemberId?: string;
  actionType?: AuditActionType;
  entityType?: AuditEntityType;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<{ entries: AuditLogEntry[]; nextCursor: string | null }> {
  const ctx = await getOrgContext();
  requireRole(ctx, "MANAGER");

  const limit = params.limit ?? 50;

  // Validate cursor format (cuid starts with 'c' and is ~25 chars)
  if (params.cursor && !/^c[a-z0-9]{20,30}$/.test(params.cursor)) {
    return { entries: [], nextCursor: null };
  }

  const where: Record<string, unknown> = {
    organizationId: ctx.organizationId,
  };

  if (params.actorMemberId) where.actorMemberId = params.actorMemberId;
  if (params.actionType) where.actionType = params.actionType;
  if (params.entityType) where.entityType = params.entityType;

  if (params.dateFrom || params.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (params.dateFrom) createdAt.gte = params.dateFrom;
    if (params.dateTo) createdAt.lte = params.dateTo;
    where.createdAt = createdAt;
  }

  // Cache key based on all filter params
  const cacheKey = `org:${ctx.organizationId}:audit:${params.cursor ?? ""}:${params.actorMemberId ?? ""}:${params.actionType ?? ""}:${params.entityType ?? ""}:${params.dateFrom?.toISOString() ?? ""}:${params.dateTo?.toISOString() ?? ""}`;

  const { getCached, TTL } = await import("@/lib/redis");
  return getCached(
    cacheKey,
    async () => {
      const results = await prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
      });

      const entries: AuditLogEntry[] = results.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        actorMemberId: r.actorMemberId,
        actorDisplayName: r.actorDisplayName,
        actionType: r.actionType as AuditActionType,
        entityType: r.entityType as AuditEntityType,
        entityId: r.entityId,
        entityName: r.entityName,
        before: r.before as Record<string, unknown> | null,
        after: r.after as Record<string, unknown> | null,
        createdAt: r.createdAt,
      }));

      const nextCursor = results.length === limit ? results[results.length - 1].id : null;
      return { entries, nextCursor };
    },
    TTL.SHORT
  );
}
