import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";
import { writeAuditLog } from "@/lib/actions/audit";
import { type OrgRole, ROLE_HIERARCHY } from "@/lib/org";

function hasManagerRole(role: OrgRole): boolean {
  // OrgRole is a strict union type — safe to use as index
  // eslint-disable-next-line security/detect-object-injection
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.MANAGER;
}

const CACHE_KEYS = (organizationId: string) => [
  `org:${organizationId}:dashboard`,
  `org:${organizationId}:inventory:*`,
];

export const createProductSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(0).optional().default(0),
  price: z.number().min(0).optional().default(0),
});

// Wrapper to allow union return types in execute — tool() overloads are too strict
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flexTool = (config: any) => tool(config);

export function getWriteTools(organizationId: string, memberId: string, role: OrgRole) {
  return {
    createProduct: flexTool({
      description: "Create a new product. name required, quantity and price default to 0.",
      parameters: createProductSchema,
      execute: async ({ name, quantity = 0, price = 0 }: { name: string; quantity?: number; price?: number }) => {
        if (!hasManagerRole(role)) return { error: "MANAGER or SUPER_ADMIN role required." };
        const created = await prisma.product.create({
          data: { name, quantity, price, organizationId },
          select: { id: true, name: true, quantity: true, price: true },
        });
        void writeAuditLog({ organizationId, actorMemberId: memberId, actorDisplayName: "", actionType: "CREATE", entityType: "Product", entityId: created.id, entityName: created.name, before: null, after: { name: created.name, quantity: created.quantity, price: Number(created.price) } }).catch(() => {});
        await invalidateCache(CACHE_KEYS(organizationId));
        return { success: true, product: { id: created.id, name: created.name, quantity: created.quantity, price: Number(created.price) } };
      },
    }),

    updateProduct: flexTool({
      description: "Update an existing product by name.",
      parameters: z.object({
        name: z.string().min(1),
        newName: z.string().min(1).optional(),
        quantity: z.number().int().min(0).optional(),
        price: z.number().min(0).optional(),
      }),
      execute: async ({ name, newName, quantity, price }: { name: string; newName?: string; quantity?: number; price?: number }) => {
        if (!hasManagerRole(role)) return { error: "MANAGER or SUPER_ADMIN role required." };
        const existing = await prisma.product.findFirst({ where: { organizationId, name: { equals: name, mode: "insensitive" } }, select: { id: true, name: true, quantity: true, price: true } });
        if (!existing) return { error: `Product "${name}" not found.` };
        const updates: Partial<{ name: string; quantity: number; price: number }> = {};
        if (newName !== undefined) updates.name = newName;
        if (quantity !== undefined) updates.quantity = quantity;
        if (price !== undefined) updates.price = price;
        const updated = await prisma.product.update({ where: { id: existing.id }, data: updates, select: { id: true, name: true, quantity: true, price: true } });
        void writeAuditLog({ organizationId, actorMemberId: memberId, actorDisplayName: "", actionType: "UPDATE", entityType: "Product", entityId: existing.id, entityName: updated.name, before: { name: existing.name, quantity: existing.quantity, price: Number(existing.price) }, after: { name: updated.name, quantity: updated.quantity, price: Number(updated.price) } }).catch(() => {});
        await invalidateCache(CACHE_KEYS(organizationId));
        return { success: true, product: { id: updated.id, name: updated.name, quantity: updated.quantity, price: Number(updated.price) } };
      },
    }),

    deleteProduct: flexTool({
      description: "Delete a product by name.",
      parameters: z.object({
        name: z.string().min(1),
      }),
      execute: async ({ name }: { name: string }) => {
        if (!hasManagerRole(role)) return { error: "MANAGER or SUPER_ADMIN role required." };
        const existing = await prisma.product.findFirst({ where: { organizationId, name: { equals: name, mode: "insensitive" } }, select: { id: true, name: true, quantity: true, price: true } });
        if (!existing) return { error: `Product "${name}" not found.` };
        await prisma.product.delete({ where: { id: existing.id } });
        void writeAuditLog({ organizationId, actorMemberId: memberId, actorDisplayName: "", actionType: "DELETE", entityType: "Product", entityId: existing.id, entityName: existing.name, before: { name: existing.name, quantity: existing.quantity, price: Number(existing.price) }, after: null }).catch(() => {});
        await invalidateCache(CACHE_KEYS(organizationId));
        return { success: true, deletedName: existing.name };
      },
    }),
  };
}
