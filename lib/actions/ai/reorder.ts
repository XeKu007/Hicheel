import { generateText } from "ai";
import { getAIModel } from "@/lib/ai/provider";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReorderSuggestionResult {
  productId: string;
  productName: string;
  currentQuantity: number;
  dailyConsumptionRate: number;
  daysUntilStockout: number;
  suggestedReorderQty: number;
}

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

/**
 * Computes the predicted days until stockout.
 * Returns floor(currentQty / dailyRate), or Infinity if dailyRate is 0.
 * Callers must guard against Infinity before using the result.
 *
 * Property 11: Days-Until-Stockout Invariant
 * Validates: Requirements 6.3, 6.12
 */
export function computeDaysUntilStockout(currentQty: number, dailyRate: number): number {
  if (dailyRate <= 0) return Infinity;
  return Math.floor(currentQty / dailyRate);
}

// ─── Reorder Engine ───────────────────────────────────────────────────────────

const CACHE_KEY = (orgId: string) => `org:${orgId}:reorder:suggestions`;
const CACHE_TTL = 3600; // seconds
const WINDOW_DAYS = 30;
const MIN_RECORDS = 3;
const STOCKOUT_THRESHOLD_DAYS = 14;

/**
 * Computes reorder suggestions for an organization.
 *
 * 1. Reads ConsumptionRecords for the last 30 days per product.
 * 2. Skips products with fewer than 3 records (insufficient data guard).
 * 3. Computes dailyRate = totalConsumed / 30.
 * 4. Computes daysUntilStockout = floor(currentQty / dailyRate); skips if dailyRate === 0.
 * 5. Generates a ReorderSuggestion for products where daysUntilStockout <= 14.
 * 6. suggestedReorderQty = ceil(30 * dailyRate).
 * 7. Deletes existing suggestions for the org, then creates new ones.
 * 8. Caches result under org:{organizationId}:reorder:suggestions with TTL 3600s.
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5, 6.9, 6.10, 6.11, 6.12
 */
export async function computeReorderSuggestions(  organizationId: string
): Promise<ReorderSuggestionResult[]> {
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Fetch products + aggregated consumption in parallel using DB aggregation
  type GroupByResult = { productId: string; _sum: { consumed: number | null }; _count: { id: number } };
  const [products, consumptionAgg] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId },
      select: { id: true, name: true, quantity: true },
    }),
    prisma.consumptionRecord.groupBy({
      by: ["productId"],
      where: { organizationId, recordedAt: { gte: windowStart } },
      _sum: { consumed: true },
      _count: { id: true },
    }) as unknown as Promise<GroupByResult[]>,
  ]);

  // Build lookup map from aggregation results
  const recordsByProduct = new Map(
    consumptionAgg.map(r => [r.productId, { totalConsumed: r._sum.consumed ?? 0, count: r._count.id }])
  );

  // Compute suggestions
  const suggestions: ReorderSuggestionResult[] = [];

  for (const product of products) {
    const data = recordsByProduct.get(product.id);
    if (!data || data.count < MIN_RECORDS) continue;

    const dailyRate = data.totalConsumed / WINDOW_DAYS;
    if (dailyRate <= 0) continue;

    const daysUntilStockout = computeDaysUntilStockout(product.quantity, dailyRate);
    // Infinity means no stockout risk — skip
    if (!isFinite(daysUntilStockout) || daysUntilStockout > STOCKOUT_THRESHOLD_DAYS) continue;

    suggestions.push({
      productId: product.id,
      productName: product.name,
      currentQuantity: product.quantity,
      dailyConsumptionRate: dailyRate,
      daysUntilStockout,
      suggestedReorderQty: Math.ceil(WINDOW_DAYS * dailyRate),
    });
  }

  // 4. Upsert: delete existing suggestions, create new ones
  await prisma.reorderSuggestion.deleteMany({ where: { organizationId } });

  if (suggestions.length > 0) {
    await prisma.reorderSuggestion.createMany({
      data: suggestions.map((s) => ({
        organizationId,
        productId: s.productId,
        productName: s.productName,
        currentQuantity: s.currentQuantity,
        dailyConsumptionRate: s.dailyConsumptionRate,
        daysUntilStockout: s.daysUntilStockout,
        suggestedReorderQty: s.suggestedReorderQty,
      })),
    });
  }

  // 5. Cache result
  try {
    await redis.setex(CACHE_KEY(organizationId), CACHE_TTL, JSON.stringify(suggestions));
  } catch {
    // Redis unavailable — continue without caching
  }

  return suggestions;
}

// ─── Reorder AI Explanation ───────────────────────────────────────────────────

const EXPLANATION_CACHE_KEY = (orgId: string, productId: string) =>
  `org:${orgId}:reorder:explanation:${productId}`;
const EXPLANATION_CACHE_TTL = 3600; // seconds

/**
 * Generates an AI explanation for a reorder suggestion.
 *
 * 1. Checks cache under org:{organizationId}:reorder:explanation:{productId} (TTL 3600s).
 * 2. If cached, returns cached value.
 * 3. Calls AI provider with consumption context to describe the trend and reason.
 * 4. Caches the result and returns it.
 * 5. Returns null if the AI provider is unavailable (caller shows fallback message).
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
export async function generateReorderExplanation(
  organizationId: string,
  productId: string,
  suggestion: ReorderSuggestionResult
): Promise<string | null> {
  const cacheKey = EXPLANATION_CACHE_KEY(organizationId, productId);

  // 1. Check cache
  try {
    const cached = await redis.get<string>(cacheKey);
    if (cached !== null) return cached;
  } catch {
    // Redis unavailable — continue without cache
  }

  // 2. Call AI provider
  try {
    const model = getAIModel();
    const prompt = `You are an inventory management assistant. Explain in 2-3 sentences why the following product needs to be reordered, describing the consumption trend and urgency.

Product: ${suggestion.productName}
Current quantity: ${suggestion.currentQuantity} units
Daily consumption rate: ${suggestion.dailyConsumptionRate.toFixed(2)} units/day
Days until stockout: ${suggestion.daysUntilStockout} days
Suggested reorder quantity: ${suggestion.suggestedReorderQty} units

Provide a concise, actionable explanation for the inventory manager.`;

    const { text } = await generateText({ model, prompt });

    // 3. Cache the result
    try {
      await redis.setex(cacheKey, EXPLANATION_CACHE_TTL, JSON.stringify(text));
    } catch {
      // Redis unavailable — continue without caching
    }

    return text;
  } catch {
    // AI provider unavailable — caller shows fallback message
    return null;
  }
}
