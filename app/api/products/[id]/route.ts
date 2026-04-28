import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { invalidateCache, redis } from "@/lib/redis";
import { trackStaffAction } from "@/lib/gamification/actions";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.coerce.number().nonnegative().optional(),
  quantity: z.coerce.number().int().min(0).optional(),
  sku: z.string().optional().nullable(),
  lowStockAt: z.coerce.number().int().min(0).optional().nullable(),
  category: z.string().max(50).optional().nullable(),
  delta: z.coerce.number().int().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // 60 writes/min per IP — prevents bulk update abuse
  const limited = await rateLimit(request as import("next/server").NextRequest, { limit: 60, window: 60, identifier: "products:patch" });
  if (limited) return limited;
  try {
    const [ctx, { id }, body] = await Promise.all([
      getOrgContext(),
      params,
      request.json(),
    ]);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    let updated;
    let previousQty: number | undefined;

    if (parsed.data.delta !== undefined) {
      // Delta mode: atomic fetch+update in a transaction to prevent lost updates
      // if the product is deleted between fetch and update
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.product.findFirst({
          where: { id, organizationId: ctx.organizationId },
          select: { id: true, quantity: true },
        });
        if (!existing) return null;
        const newQty = Math.max(0, existing.quantity + parsed.data.delta!);
        const updated = await tx.product.update({ where: { id }, data: { quantity: newQty } });
        return { existing, updated };
      });
      if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
      previousQty = result.existing.quantity;
      updated = result.updated;
    } else {
      // Regular update: fetch existing for alert comparison, then update
      const existing = await prisma.product.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: { id: true, quantity: true },
      });
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
      previousQty = existing.quantity;

      const newData: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) newData.name = parsed.data.name;
      if (parsed.data.price !== undefined) newData.price = parsed.data.price;
      if (parsed.data.quantity !== undefined) newData.quantity = parsed.data.quantity;
      if (parsed.data.sku !== undefined) newData.sku = parsed.data.sku;
      if (parsed.data.lowStockAt !== undefined) newData.lowStockAt = parsed.data.lowStockAt;
      if (parsed.data.category !== undefined) newData.category = parsed.data.category;

      updated = await prisma.product.update({ where: { id }, data: newData });
    }

    // Fire-and-forget side effects — alerts need the PREVIOUS qty
    if (previousQty !== undefined && (parsed.data.quantity !== undefined || parsed.data.delta !== undefined)) {
      const { maybeCreateAlerts } = await import("@/lib/actions/products");
      void maybeCreateAlerts(
        ctx.organizationId, id,
        updated.name,
        previousQty,
        updated.quantity,
        updated.lowStockAt ?? null
      ).catch(() => {});
    }

    void trackStaffAction({ memberId: ctx.memberId, organizationId: ctx.organizationId, type: "PRODUCT_UPDATED" }).catch(() => {});
    void invalidateCache([
      `org:${ctx.organizationId}:dashboard`,
      `org:${ctx.organizationId}:inventory:*`,
      `org:${ctx.organizationId}:categories`,
      `org:${ctx.organizationId}:categories:counts`,
    ]).catch(() => {});

    // Publish real-time event — pipeline lpush + expire together
    const eventPayload = JSON.stringify({
      type: "product_updated",
      product: { id: updated.id, name: updated.name, quantity: updated.quantity, price: Number(updated.price), sku: updated.sku, lowStockAt: updated.lowStockAt, imageUrl: updated.imageUrl },
    });
    void redis.pipeline()
      .lpush(`org:${ctx.organizationId}:inventory:updates`, eventPayload)
      .expire(`org:${ctx.organizationId}:inventory:updates`, 60)
      .exec()
      .catch(() => {});

    return NextResponse.json({
      id: updated.id, name: updated.name, sku: updated.sku,
      price: Number(updated.price), quantity: updated.quantity,
      lowStockAt: updated.lowStockAt, imageUrl: updated.imageUrl,
      category: (updated as Record<string, unknown>).category as string | null ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // 30 deletes/min per IP — stricter than PATCH
  const limited = await rateLimit(_request as import("next/server").NextRequest, { limit: 30, window: 60, identifier: "products:delete" });
  if (limited) return limited;
  try {
    const [ctx, { id }] = await Promise.all([getOrgContext(), params]);

    // Interactive transaction: fetch then delete atomically
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: { id: true, name: true, quantity: true, lowStockAt: true },
      });
      if (!p) return null;
      await tx.product.delete({ where: { id } });
      return p;
    });

    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Create ANOMALY alert for deletion if product had stock
    if (product.quantity > 0) {
      void prisma.alert.create({
        data: {
          organizationId: ctx.organizationId,
          type: "ANOMALY",
          productId: id,
          productName: product.name,
          previousQty: product.quantity,
          newQty: 0,
          percentageDrop: 100,
        },
      }).catch(() => {});
      void invalidateCache([`org:${ctx.organizationId}:alerts:unread_count`]).catch(() => {});
    }

    void invalidateCache([
      `org:${ctx.organizationId}:dashboard`,
      `org:${ctx.organizationId}:inventory:*`,
      `org:${ctx.organizationId}:categories`,
      `org:${ctx.organizationId}:categories:counts`,
    ]).catch(() => {});

    void redis.pipeline()
      .lpush(`org:${ctx.organizationId}:inventory:updates`, JSON.stringify({ type: "product_deleted", id }))
      .expire(`org:${ctx.organizationId}:inventory:updates`, 60)
      .exec()
      .catch(() => {});

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
