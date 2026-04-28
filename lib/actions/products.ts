"use server";

import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";
import { trackStaffAction } from "@/lib/gamification/actions";
import { writeAuditLog } from "@/lib/actions/audit";
import { checkPlanLimit, buildLimitError } from "@/lib/billing";
import { z } from "zod";

const ProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.coerce.number().nonnegative("Price must be non-negative"),
  quantity: z.coerce.number().int().min(0, "Quantity must be non-negative"),
  sku: z.string().optional(),
  lowStockAt: z.coerce.number().int().min(0).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  category: z.string().max(50).optional(),
});

/**
 * Triggers workflow rules for quantity-based events.
 * Called fire-and-forget after any quantity change.
 */
async function triggerQuantityWorkflows(
  organizationId: string,
  productId: string,
  productName: string,
  newQty: number,
  lowStockAt: number | null
): Promise<void> {
  try {
    const { evaluateWorkflowRules } = await import("@/lib/actions/ai/workflows");
    const context = { productId, productName, quantity: newQty, lowStockAt };

    // Evaluate QUANTITY_BELOW rules
    await evaluateWorkflowRules(organizationId, "QUANTITY_BELOW", context, true);

    // Evaluate QUANTITY_ABOVE rules
    await evaluateWorkflowRules(organizationId, "QUANTITY_ABOVE", context, true);
  } catch (err) {
    console.error("[triggerQuantityWorkflows] Failed:", err);
  }
}

/**
 * Creates a ConsumptionRecord if the new quantity is strictly less than the previous quantity.
 * Exported for testing.
 */
export async function createConsumptionRecordIfDecreased(
  organizationId: string,
  productId: string,
  previousQty: number,
  newQty: number
): Promise<void> {
  if (newQty < previousQty) {
    await prisma.consumptionRecord.create({
      data: {
        organizationId,
        productId,
        quantityBefore: previousQty,
        quantityAfter: newQty,
        consumed: previousQty - newQty,
      },
    });
    void invalidateCache([`org:${organizationId}:reorder:suggestions`]).catch(() => {});
  }
}

/**
 * Checks whether alerts should be created or dismissed after a product quantity change.
 * Internal helper — not exported.
 */
export async function maybeCreateAlerts(
  organizationId: string,
  productId: string,
  productName: string,
  previousQty: number,
  newQty: number,
  lowStockAt: number | null
): Promise<void> {
  const tasks: Promise<boolean>[] = [];

  // ── Low stock check ──────────────────────────────────────────────────────
  if (lowStockAt !== null && newQty <= lowStockAt) {
    tasks.push(
      (async () => {
        const existing = await prisma.alert.findFirst({
          where: { organizationId, productId, type: "LOW_STOCK", status: "UNREAD" },
          select: { id: true },
        });
        if (!existing) {
          await prisma.alert.create({
            data: { organizationId, type: "LOW_STOCK", productId, productName, currentQty: newQty, lowStockAt },
          });
          return true;
        }
        return false;
      })()
    );
  } else if (lowStockAt !== null && newQty > lowStockAt) {
    // Auto-dismiss existing UNREAD low stock alerts for this product
    tasks.push(
      (async () => {
        const result = await prisma.alert.updateMany({
          where: { organizationId, productId, type: "LOW_STOCK", status: "UNREAD" },
          data: { status: "DISMISSED" },
        });
        return result.count > 0;
      })()
    );
  }

  // ── Anomaly check ────────────────────────────────────────────────────────
  if (previousQty > 0 && newQty < previousQty) {
    const drop = (previousQty - newQty) / previousQty;
    // Trigger alert when drop is 30% or more (>= 0.3)
    if (drop >= 0.3) {
      tasks.push(
        (async () => {
          await prisma.alert.create({
            data: {
              organizationId,
              type: "ANOMALY",
              productId,
              productName,
              previousQty,
              newQty,
              percentageDrop: drop * 100,
            },
          });
          return true;
        })()
      );
    }
  }

  if (tasks.length === 0) return;

  const results = await Promise.all(tasks).catch((err) => {
    console.error("[maybeCreateAlerts] Failed:", err);
    return [] as boolean[];
  });

  const anyChange = results.some(Boolean);
  if (anyChange) {
    // Invalidate unread count + cached pages
    const pageKeys = Array.from({ length: 10 }, (_, i) => `org:${organizationId}:alerts:page:${i + 1}`);
    await invalidateCache([`org:${organizationId}:alerts:unread_count`, ...pageKeys]);
  }
}
export async function deleteProduct(formData: FormData) {
  const ctx = await getOrgContext();
  const id = String(formData.get("id") || "");

  // Interactive transaction: fetch then delete atomically
  const snapshot = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, name: true, price: true, quantity: true, sku: true },
    });
    if (!product) return null;
    await tx.product.delete({ where: { id } });
    return product;
  });

  if (snapshot) {
    void writeAuditLog({
      organizationId: ctx.organizationId,
      actorMemberId: ctx.memberId,
      actorDisplayName: "",
      actionType: "DELETE",
      entityType: "Product",
      entityId: id,
      entityName: snapshot.name,
      before: { name: snapshot.name, price: Number(snapshot.price), quantity: snapshot.quantity, sku: snapshot.sku ?? null },
      after: null,
    }).catch(() => {});
  }

  void invalidateCache([
    `org:${ctx.organizationId}:dashboard`,
    `org:${ctx.organizationId}:inventory:*`,
    `org:${ctx.organizationId}:categories`,
    `org:${ctx.organizationId}:categories:counts`,
  ]).catch(() => {});
}

export async function createProduct(formData: FormData) {
  const ctx = await getOrgContext();

  const parsed = ProductSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
    quantity: formData.get("quantity"),
    sku: formData.get("sku") || undefined,
    lowStockAt: formData.get("lowStockAt") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
    category: formData.get("category") || undefined,
  });

  if (!parsed.success) {
    throw new Error("Validation failed");
  }

  // Run all pre-create checks in parallel — saves 2-3 sequential round-trips
  const [skuExists, productCount, existingCategory] = await Promise.all([
    // SKU uniqueness check (only if SKU provided)
    parsed.data.sku
      ? prisma.product.findFirst({
          where: { organizationId: ctx.organizationId, sku: parsed.data.sku },
          select: { id: true },
        })
      : Promise.resolve(null),
    // Product count for plan limit
    prisma.product.count({ where: { organizationId: ctx.organizationId } }),
    // Category existence check (only if category provided)
    parsed.data.category
      ? prisma.product.findFirst({
          where: { organizationId: ctx.organizationId, category: parsed.data.category },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (parsed.data.sku && skuExists) {
    throw new Error(`SKU "${parsed.data.sku}" already exists in your organization.`);
  }

  const productCheck = await checkPlanLimit(ctx.organizationId, "products", productCount);
  if (!productCheck.allowed) {
    return buildLimitError("products", productCheck.current, productCheck.limit);
  }

  // Category limit check — only if new category being introduced
  if (parsed.data.category && !existingCategory) {
    const categoryCount = await prisma.product.groupBy({
      by: ["category"],
      where: { organizationId: ctx.organizationId, category: { not: null } },
      _count: { id: true },
    });
    const catCheck = await checkPlanLimit(ctx.organizationId, "categories", categoryCount.length);
    if (!catCheck.allowed) {
      return buildLimitError("categories", catCheck.current, catCheck.limit);
    }
  }

  const created = await prisma.product.create({
    data: {
      ...parsed.data,
      imageUrl: parsed.data.imageUrl || null,
      category: parsed.data.category || null,
      organizationId: ctx.organizationId,
    },
  });

  void trackStaffAction({
    memberId: ctx.memberId,
    organizationId: ctx.organizationId,
    type: "PRODUCT_CREATED",
    productId: created.id,
    productName: created.name,
    quantityBefore: 0,
    quantityAfter: created.quantity,
  }).catch(() => {});

  void writeAuditLog({
    organizationId: ctx.organizationId,
    actorMemberId: ctx.memberId,
    actorDisplayName: "",
    actionType: "CREATE",
    entityType: "Product",
    entityId: created.id,
    entityName: created.name,
    before: null,
    after: { name: created.name, price: Number(created.price), quantity: created.quantity, sku: created.sku ?? null },
  }).catch(() => {});

  await invalidateCache([
    `org:${ctx.organizationId}:dashboard`,
    `org:${ctx.organizationId}:inventory:*`,
    `org:${ctx.organizationId}:categories`,
    `org:${ctx.organizationId}:categories:counts`,
  ]);

  redirect("/inventory");
}

export async function updateProduct(formData: FormData) {
  const ctx = await getOrgContext();
  const id = String(formData.get("id") || "");

  // Verify product belongs to this org and capture current quantity
  const existing = await prisma.product.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!existing) throw new Error("Product not found.");

  const parsed = ProductSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
    quantity: formData.get("quantity"),
    sku: formData.get("sku") || undefined,
    lowStockAt: formData.get("lowStockAt") || undefined,
    category: formData.get("category") || undefined,
  });

  if (!parsed.success) {
    throw new Error("Validation failed");
  }

  await prisma.product.update({
    where: { id },
    data: parsed.data,
  });

  // Fire-and-forget consumption record
  void createConsumptionRecordIfDecreased(ctx.organizationId, id, existing.quantity, parsed.data.quantity).catch(() => {});

  // Fire-and-forget — alert checks must not block the response
  void maybeCreateAlerts(
    ctx.organizationId,
    id,
    parsed.data.name,
    existing.quantity,
    parsed.data.quantity,
    parsed.data.lowStockAt ?? existing.lowStockAt ?? null
  ).catch(() => {});

  // Fire-and-forget — trigger quantity-based workflow rules
  void triggerQuantityWorkflows(
    ctx.organizationId, id, parsed.data.name,
    parsed.data.quantity, parsed.data.lowStockAt ?? existing.lowStockAt ?? null
  ).catch(() => {});

  void trackStaffAction({
    memberId: ctx.memberId,
    organizationId: ctx.organizationId,
    type: "PRODUCT_UPDATED",
    productId: id,
    productName: parsed.data.name,
    quantityBefore: existing.quantity,
    quantityAfter: parsed.data.quantity,
  }).catch(() => {});

  void writeAuditLog({
    organizationId: ctx.organizationId,
    actorMemberId: ctx.memberId,
    actorDisplayName: "",
    actionType: "UPDATE",
    entityType: "Product",
    entityId: id,
    entityName: parsed.data.name,
    before: { name: existing.name, price: Number(existing.price), quantity: existing.quantity, sku: existing.sku ?? null },
    after: { name: parsed.data.name, price: parsed.data.price, quantity: parsed.data.quantity, sku: parsed.data.sku ?? null },
  }).catch(() => {});

  await invalidateCache([
    `org:${ctx.organizationId}:dashboard`,
    `org:${ctx.organizationId}:inventory:*`,
    `org:${ctx.organizationId}:categories`,
    `org:${ctx.organizationId}:categories:counts`,
  ]);

  redirect("/inventory");
}

export async function dispatchProduct(formData: FormData) {
  const ctx = await getOrgContext();
  const productId = String(formData.get("productId") || "");
  const qty = Number(formData.get("quantity") || 0);
  const reason = String(formData.get("reason") || "").trim() || null;

  if (!productId || qty <= 0) throw new Error("Invalid input");

  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId: ctx.organizationId },
  });
  if (!product) throw new Error("Product not found");
  if (product.quantity < qty) throw new Error("Insufficient stock");

  const newQty = product.quantity - qty;

  await prisma.product.update({
    where: { id: productId },
    data: { quantity: newQty },
  });

  // Fire-and-forget consumption record
  void createConsumptionRecordIfDecreased(ctx.organizationId, productId, product.quantity, newQty).catch(() => {});

  // Fire-and-forget alerts + tracking
  void maybeCreateAlerts(ctx.organizationId, productId, product.name, product.quantity, newQty, product.lowStockAt ?? null).catch(() => {});

  // Fire-and-forget — trigger quantity-based workflow rules
  void triggerQuantityWorkflows(
    ctx.organizationId, productId, product.name, newQty, product.lowStockAt ?? null
  ).catch(() => {});
  void trackStaffAction({
    memberId: ctx.memberId,
    organizationId: ctx.organizationId,
    type: "PRODUCT_UPDATED",
    productId,
    productName: product.name,
    quantityBefore: product.quantity,
    quantityAfter: newQty,
  }).catch(() => {});

  await invalidateCache([
    `org:${ctx.organizationId}:dashboard`,
    `org:${ctx.organizationId}:inventory:*`,
    `org:${ctx.organizationId}:dispatch:products`,
  ]);

  redirect("/inventory");
}

export async function adjustQuantity(formData: FormData) {
  const ctx = await getOrgContext();
  const id = String(formData.get("id") || "");
  const delta = Number(formData.get("delta") || 0);

  if (!id || delta === 0) return;

  const product = await prisma.product.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!product) throw new Error("Product not found");

  const newQty = Math.max(0, product.quantity + delta);

  await prisma.product.update({
    where: { id },
    data: { quantity: newQty },
  });

  // Fire-and-forget consumption record
  void createConsumptionRecordIfDecreased(ctx.organizationId, id, product.quantity, newQty).catch(() => {});

  void maybeCreateAlerts(ctx.organizationId, id, product.name, product.quantity, newQty, product.lowStockAt ?? null).catch(() => {});
  void trackStaffAction({
    memberId: ctx.memberId,
    organizationId: ctx.organizationId,
    type: "PRODUCT_UPDATED",
    productId: id,
    productName: product.name,
    quantityBefore: product.quantity,
    quantityAfter: newQty,
  }).catch(() => {});

  await invalidateCache([
    `org:${ctx.organizationId}:dashboard`,
    `org:${ctx.organizationId}:inventory:*`,
  ]);
}
