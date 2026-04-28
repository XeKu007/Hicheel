// Feature: ai-agent-workflow, Property 10: Consumption Record Created on Quantity Decrease

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockConsumptionRecordCreate = vi.fn();
const mockInvalidateCache = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    consumptionRecord: {
      create: (...args: unknown[]) => mockConsumptionRecordCreate(...args),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  invalidateCache: (...args: unknown[]) => mockInvalidateCache(...args),
}));

// Mock modules that products.ts imports but are not needed for the helper
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/org", () => ({ getOrgContext: vi.fn() }));
vi.mock("@/lib/gamification/actions", () => ({ trackStaffAction: vi.fn() }));
vi.mock("@/lib/actions/audit", () => ({ writeAuditLog: vi.fn() }));

// Import AFTER mocks
import { createConsumptionRecordIfDecreased } from "../../lib/actions/products";

// ── Arbitraries ────────────────────────────────────────────────────────────

const orgIdArb = fc.stringMatching(/^org-[a-z0-9]{4,8}$/);
const productIdArb = fc.stringMatching(/^prod-[a-z0-9]{4,8}$/);

/** Generates a pair (previousQty, newQty) where newQty < previousQty */
const decreaseArb = fc
  .tuple(fc.integer({ min: 1, max: 10_000 }), fc.integer({ min: 1, max: 10_000 }))
  .filter(([a, b]) => b < a)
  .map(([prev, next]) => ({ previousQty: prev, newQty: next }));

/** Generates a pair (previousQty, newQty) where newQty >= previousQty */
const noDecreaseArb = fc
  .tuple(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 10_000 }))
  .filter(([a, b]) => b >= a)
  .map(([prev, next]) => ({ previousQty: prev, newQty: next }));

// ── Property 10: Consumption Record Created on Quantity Decrease ───────────

describe("Property 10: Consumption Record Created on Quantity Decrease", () => {
  /**
   * Validates: Requirements 6.1
   *
   * For any Product quantity update where the new quantity is strictly less
   * than the previous quantity, the system SHALL create exactly one
   * ConsumptionRecord with `consumed = quantityBefore - quantityAfter`.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumptionRecordCreate.mockResolvedValue({ id: "cr-1" });
    mockInvalidateCache.mockResolvedValue(undefined);
  });

  it("creates exactly one ConsumptionRecord with correct consumed value when newQty < previousQty", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        productIdArb,
        decreaseArb,
        async (orgId, productId, { previousQty, newQty }) => {
          vi.clearAllMocks();
          mockConsumptionRecordCreate.mockResolvedValue({ id: "cr-1" });
          mockInvalidateCache.mockResolvedValue(undefined);

          await createConsumptionRecordIfDecreased(orgId, productId, previousQty, newQty);

          // Exactly one ConsumptionRecord must be created
          expect(mockConsumptionRecordCreate).toHaveBeenCalledTimes(1);

          const call = mockConsumptionRecordCreate.mock.calls[0][0];
          expect(call.data).toMatchObject({
            organizationId: orgId,
            productId,
            quantityBefore: previousQty,
            quantityAfter: newQty,
            consumed: previousQty - newQty,
          });

          // consumed must equal quantityBefore - quantityAfter
          expect(call.data.consumed).toBe(previousQty - newQty);
          expect(call.data.consumed).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("invalidates the reorder suggestions cache key when a consumption record is created", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        productIdArb,
        decreaseArb,
        async (orgId, productId, { previousQty, newQty }) => {
          vi.clearAllMocks();
          mockConsumptionRecordCreate.mockResolvedValue({ id: "cr-1" });
          mockInvalidateCache.mockResolvedValue(undefined);

          await createConsumptionRecordIfDecreased(orgId, productId, previousQty, newQty);

          // Cache invalidation must be called with the reorder suggestions key
          // (fire-and-forget, so we wait a tick)
          await new Promise((r) => setTimeout(r, 0));

          const allCalls = mockInvalidateCache.mock.calls.flat(2);
          expect(allCalls).toContain(`org:${orgId}:reorder:suggestions`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("does NOT create a ConsumptionRecord when newQty >= previousQty", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        productIdArb,
        noDecreaseArb,
        async (orgId, productId, { previousQty, newQty }) => {
          vi.clearAllMocks();

          await createConsumptionRecordIfDecreased(orgId, productId, previousQty, newQty);

          // No ConsumptionRecord should be created
          expect(mockConsumptionRecordCreate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("does NOT invalidate cache when newQty >= previousQty", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        productIdArb,
        noDecreaseArb,
        async (orgId, productId, { previousQty, newQty }) => {
          vi.clearAllMocks();

          await createConsumptionRecordIfDecreased(orgId, productId, previousQty, newQty);

          await new Promise((r) => setTimeout(r, 0));
          expect(mockInvalidateCache).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 11: Days-Until-Stockout Invariant ────────────────────────────────
// Feature: ai-agent-workflow, Property 11: Days-Until-Stockout Invariant

import { computeDaysUntilStockout, computeReorderSuggestions } from "../../lib/actions/ai/reorder";

describe("Property 11: Days-Until-Stockout Invariant", () => {
  /**
   * Validates: Requirements 6.3, 6.12
   *
   * For any Product with a positive dailyRate and non-negative currentQty,
   * daysUntilStockout SHALL equal floor(currentQty / dailyRate).
   */

  it("daysUntilStockout equals floor(currentQty / dailyRate) for all positive rates and non-negative quantities", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.double({ min: 0.01, max: 100, noNaN: true }),
        (currentQty, dailyRate) => {
          const result = computeDaysUntilStockout(currentQty, dailyRate);
          expect(result).toBe(Math.floor(currentQty / dailyRate));
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 12: Reorder Suggestion Threshold ─────────────────────────────────
// Feature: ai-agent-workflow, Property 12: Reorder Suggestion Threshold

const mockProductFindMany = vi.fn();
const mockConsumptionFindMany = vi.fn();
const mockReorderDeleteMany = vi.fn();
const mockReorderCreateMany = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisSetex = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findMany: (...args: unknown[]) => mockProductFindMany(...args),
    },
    consumptionRecord: {
      findMany: (...args: unknown[]) => mockConsumptionFindMany(...args),
      create: (...args: unknown[]) => mockConsumptionRecordCreate(...args),
    },
    reorderSuggestion: {
      deleteMany: (...args: unknown[]) => mockReorderDeleteMany(...args),
      createMany: (...args: unknown[]) => mockReorderCreateMany(...args),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    setex: (...args: unknown[]) => mockRedisSetex(...args),
  },
  invalidateCache: (...args: unknown[]) => mockInvalidateCache(...args),
}));

describe("Property 12: Reorder Suggestion Threshold", () => {
  /**
   * Validates: Requirements 6.4, 6.5
   *
   * For products where daysUntilStockout <= 14 with >= 3 records, a suggestion IS generated.
   * For products where daysUntilStockout > 14, no suggestion is generated.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    mockReorderDeleteMany.mockResolvedValue({ count: 0 });
    mockReorderCreateMany.mockResolvedValue({ count: 0 });
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");
  });

  it("generates a suggestion for products where daysUntilStockout <= 14 with >= 3 records", async () => {
    await fc.assert(
      fc.asyncProperty(
        // currentQty: 0–140, dailyRate: 1–100 → daysUntilStockout = floor(qty/rate) <= 14
        fc.integer({ min: 0, max: 140 }),
        fc.double({ min: 1, max: 100, noNaN: true }),
        async (currentQty, dailyRate) => {
          vi.clearAllMocks();
          mockReorderDeleteMany.mockResolvedValue({ count: 0 });
          mockReorderCreateMany.mockResolvedValue({ count: 0 });
          mockRedisGet.mockResolvedValue(null);
          mockRedisSetex.mockResolvedValue("OK");

          const daysUntilStockout = Math.floor(currentQty / dailyRate);
          // Only test cases where threshold is actually <= 14
          if (daysUntilStockout > 14) return;

          const totalConsumed = dailyRate * 30;
          // 3 records each contributing totalConsumed/3
          const perRecord = Math.ceil(totalConsumed / 3);

          mockProductFindMany.mockResolvedValue([
            { id: "prod-1", name: "Product A", quantity: currentQty },
          ]);
          mockConsumptionFindMany.mockResolvedValue([
            { productId: "prod-1", consumed: perRecord },
            { productId: "prod-1", consumed: perRecord },
            { productId: "prod-1", consumed: perRecord },
          ]);

          const suggestions = await computeReorderSuggestions("org-test");

          expect(suggestions.length).toBeGreaterThanOrEqual(1);
          const s = suggestions.find((x) => x.productId === "prod-1");
          expect(s).toBeDefined();
          expect(s!.suggestedReorderQty).toBe(Math.ceil(30 * (perRecord * 3) / 30));
        }
      ),
      { numRuns: 50 }
    );
  });

  it("does NOT generate a suggestion for products where daysUntilStockout > 14", async () => {
    await fc.assert(
      fc.asyncProperty(
        // currentQty: 1500–10000, dailyRate: 0.01–1 → daysUntilStockout > 14
        fc.integer({ min: 1500, max: 10000 }),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        async (currentQty, dailyRate) => {
          vi.clearAllMocks();
          mockReorderDeleteMany.mockResolvedValue({ count: 0 });
          mockReorderCreateMany.mockResolvedValue({ count: 0 });
          mockRedisGet.mockResolvedValue(null);
          mockRedisSetex.mockResolvedValue("OK");

          const daysUntilStockout = Math.floor(currentQty / dailyRate);
          // Only test cases where threshold is actually > 14
          if (daysUntilStockout <= 14) return;

          const totalConsumed = dailyRate * 30;
          const perRecord = Math.max(1, Math.ceil(totalConsumed / 3));

          mockProductFindMany.mockResolvedValue([
            { id: "prod-2", name: "Product B", quantity: currentQty },
          ]);
          mockConsumptionFindMany.mockResolvedValue([
            { productId: "prod-2", consumed: perRecord },
            { productId: "prod-2", consumed: perRecord },
            { productId: "prod-2", consumed: perRecord },
          ]);

          const suggestions = await computeReorderSuggestions("org-test");

          const s = suggestions.find((x) => x.productId === "prod-2");
          expect(s).toBeUndefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ── Property 13: Insufficient Data Guard ──────────────────────────────────────
// Feature: ai-agent-workflow, Property 13: Insufficient Data Guard

describe("Property 13: Insufficient Data Guard", () => {
  /**
   * Validates: Requirements 6.11
   *
   * For products with 0, 1, or 2 ConsumptionRecords in the 30-day window,
   * no ReorderSuggestion is generated.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    mockReorderDeleteMany.mockResolvedValue({ count: 0 });
    mockReorderCreateMany.mockResolvedValue({ count: 0 });
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");
  });

  it("does NOT generate a suggestion for products with 0, 1, or 2 records", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 2 }), // record count: 0, 1, or 2
        fc.integer({ min: 1, max: 1000 }), // currentQty
        async (recordCount, currentQty) => {
          vi.clearAllMocks();
          mockReorderDeleteMany.mockResolvedValue({ count: 0 });
          mockReorderCreateMany.mockResolvedValue({ count: 0 });
          mockRedisGet.mockResolvedValue(null);
          mockRedisSetex.mockResolvedValue("OK");

          mockProductFindMany.mockResolvedValue([
            { id: "prod-guard", name: "Guard Product", quantity: currentQty },
          ]);

          // Return exactly recordCount records (each consuming 10 units)
          const records = Array.from({ length: recordCount }, () => ({
            productId: "prod-guard",
            consumed: 10,
          }));
          mockConsumptionFindMany.mockResolvedValue(records);

          const suggestions = await computeReorderSuggestions("org-test");

          // No suggestion should be generated for this product
          const s = suggestions.find((x) => x.productId === "prod-guard");
          expect(s).toBeUndefined();

          // createMany should not be called with this product's data
          if (mockReorderCreateMany.mock.calls.length > 0) {
            const createCall = mockReorderCreateMany.mock.calls[0][0];
            const createdIds = (createCall.data as Array<{ productId: string }>).map(
              (d) => d.productId
            );
            expect(createdIds).not.toContain("prod-guard");
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
