import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const t = (config: any) => tool(config);

export function getReadTools(organizationId: string) {
  return {
    countProducts: t({
      description: "Count products in the inventory, optionally filtered by name.",
      parameters: z.object({
        nameFilter: z.string().optional().describe("Optional name filter"),
      }),
      execute: async ({ nameFilter }: { nameFilter?: string }) => {
        const count = await prisma.product.count({
          where: {
            organizationId,
            ...(nameFilter ? { name: { contains: nameFilter, mode: "insensitive" } } : {}),
          },
        });
        return { count };
      },
    }),

    listLowStockProducts: t({
      description: "List all products at or below their low stock threshold.",
      parameters: z.object({ _: z.string().optional() }),
      execute: async () => {
        const products = await prisma.product.findMany({
          where: { organizationId, lowStockAt: { not: null } },
          select: { id: true, name: true, sku: true, quantity: true, lowStockAt: true },
        });
        const filtered = products.filter(p => p.quantity <= (p.lowStockAt ?? 0));
        return { products: filtered, count: filtered.length };
      },
    }),

    getProductByName: t({
      description: "Get details of a specific product by name.",
      parameters: z.object({
        name: z.string().describe("Product name to search for"),
      }),
      execute: async ({ name }: { name: string }) => {
        const product = await prisma.product.findFirst({
          where: { organizationId, name: { contains: name, mode: "insensitive" } },
          select: { id: true, name: true, sku: true, quantity: true, price: true, lowStockAt: true },
        });
        if (!product) return { found: false, product: null };
        return { found: true, product: { ...product, price: Number(product.price) } };
      },
    }),

    listTopValueProducts: t({
      description: "List the top N most valuable products by total stock value.",
      parameters: z.object({
        limit: z.number().int().min(1).max(50).describe("Number of products to return"),
      }),
      execute: async ({ limit }: { limit: number }) => {
        const products = await prisma.product.findMany({
          where: { organizationId },
          select: { id: true, name: true, sku: true, quantity: true, price: true },
        });
        const sorted = products
          .map(p => ({ ...p, price: Number(p.price), totalValue: Number(p.price) * p.quantity }))
          .sort((a, b) => b.totalValue - a.totalValue)
          .slice(0, Math.min(50, limit));
        return { products: sorted };
      },
    }),

    getInventorySummary: t({
      description: "Get overall inventory health summary.",
      parameters: z.object({ _: z.string().optional() }),
      execute: async () => {
        const products = await prisma.product.findMany({
          where: { organizationId },
          select: { price: true, quantity: true, lowStockAt: true },
        });
        const totalSKUs = products.length;
        const totalValue = products.reduce((sum, p) => sum + Number(p.price) * p.quantity, 0);
        const lowStockCount = products.filter(p => p.lowStockAt !== null && p.quantity <= p.lowStockAt).length;
        const outOfStockCount = products.filter(p => p.quantity === 0).length;
        return { totalSKUs, totalValue, lowStockCount, outOfStockCount };
      },
    }),
  };
}
