import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getCached, TTL } from "@/lib/redis";
import { rateLimit } from "@/lib/rate-limit";
import { corsHeaders, handleCorsOptions } from "@/lib/api-utils";

export function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(request: Request) {
  const req = request as NextRequest;
  const origin = req.headers.get("origin");

  // Run rate limit and org context in parallel
  const [limited, ctx] = await Promise.all([
    rateLimit(req, { limit: 100, window: 60 }),
    getOrgContext().catch(() => null),
  ]);
  if (limited) return limited;
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    if (!Number.isFinite(page)) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    const pageSize = 10;

    // Cache key includes org + query + page
    const cacheKey = `org:${ctx.organizationId}:inventory:${encodeURIComponent(q)}:${page}`;

    const result = await getCached(
      cacheKey,
      async () => {
        const where = {
          organizationId: ctx.organizationId,
          ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
        };

        const [items, totalCount] = await Promise.all([
          prisma.product.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
              id: true, name: true, sku: true,
              price: true, quantity: true,
              lowStockAt: true, imageUrl: true, category: true,
            },
          }),
          prisma.product.count({ where }),
        ]);

        return {
          items: items.map(p => ({
            id: p.id, name: p.name, sku: p.sku,
            price: Number(p.price), quantity: p.quantity,
            lowStockAt: p.lowStockAt, imageUrl: p.imageUrl, category: p.category,
          })),
          totalCount,
          totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        };
      },
      TTL.SHORT
    );

    return NextResponse.json(result, { headers: corsHeaders(origin) });
  } catch {
    console.error("[products GET] Failed");
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
