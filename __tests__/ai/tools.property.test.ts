// Feature: ai-agent-workflow, Property 1: Tool_Call Idempotence

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Mock prisma before importing the module under test
vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    product: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      fields: {
        lowStockAt: "lowStockAt",
      },
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from "@/lib/prisma";
import { getReadTools } from "../../lib/ai/tools/read";

// Typed mock helpers
const mockCount = vi.mocked(prisma.product.count);
const mockFindMany = vi.mocked(prisma.product.findMany);
const mockFindFirst = vi.mocked(prisma.product.findFirst);

// Arbitrary for valid organizationId (non-empty alphanumeric string)
const orgIdArb = fc.stringMatching(/^[a-z0-9]{8,16}$/);

// Arbitrary for optional name filter
const nameFilterArb = fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined });

// Arbitrary for limit (1–50)
const limitArb = fc.integer({ min: 1, max: 50 });

// Arbitrary for product name (non-empty)
const productNameArb = fc.string({ minLength: 1, maxLength: 40 });

// A deterministic fake product list
function makeFakeProducts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `prod-${i}`,
    name: `Product ${i}`,
    sku: `SKU-${i}`,
    quantity: i * 10,
    price: { toNumber: () => i * 5 } as unknown as import("@prisma/client").Prisma.Decimal,
    lowStockAt: i % 3 === 0 ? i * 2 : null,
  }));
}

describe("Property 1: Tool_Call Idempotence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Validates: Requirements 2.6
   *
   * For any valid Tool_Call input and an unchanged database state,
   * executing the same read Tool_Call twice SHALL return equivalent results.
   */

  it("countProducts: same inputs return equivalent results", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, nameFilterArb, async (orgId, nameFilter) => {
        const fixedCount = Math.floor(Math.random() * 100);
        mockCount.mockResolvedValue(fixedCount);

        const tools = getReadTools(orgId);
        const result1 = await tools.countProducts.execute!({ nameFilter }, {} as never);
        const result2 = await tools.countProducts.execute!({ nameFilter }, {} as never);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 }
    );
  });

  it("listLowStockProducts: same inputs return equivalent results", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, async (orgId) => {
        const fakeProducts = makeFakeProducts(5).map(p => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: p.quantity,
          lowStockAt: p.lowStockAt,
        }));

        // listLowStockProducts calls findMany twice internally — both calls return the same data
        mockFindMany.mockResolvedValue(fakeProducts as never);

        const tools = getReadTools(orgId);
        const result1 = await tools.listLowStockProducts.execute!({}, {} as never);
        const result2 = await tools.listLowStockProducts.execute!({}, {} as never);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 }
    );
  });

  it("getProductByName: same inputs return equivalent results", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, productNameArb, async (orgId, name) => {
        const fakeProduct = {
          id: "prod-1",
          name,
          sku: "SKU-1",
          quantity: 42,
          price: 9.99 as unknown as import("@prisma/client").Prisma.Decimal,
          lowStockAt: 5,
        };
        mockFindFirst.mockResolvedValue(fakeProduct as never);

        const tools = getReadTools(orgId);
        const result1 = await tools.getProductByName.execute!({ name }, {} as never);
        const result2 = await tools.getProductByName.execute!({ name }, {} as never);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 }
    );
  });

  it("getProductByName: returns equivalent results when product not found", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, productNameArb, async (orgId, name) => {
        mockFindFirst.mockResolvedValue(null);

        const tools = getReadTools(orgId);
        const result1 = await tools.getProductByName.execute!({ name }, {} as never);
        const result2 = await tools.getProductByName.execute!({ name }, {} as never);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 }
    );
  });

  it("listTopValueProducts: same inputs return equivalent results", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, limitArb, async (orgId, limit) => {
        const fakeProducts = makeFakeProducts(20).map(p => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: p.quantity,
          price: p.quantity * 2 as unknown as import("@prisma/client").Prisma.Decimal,
        }));
        mockFindMany.mockResolvedValue(fakeProducts as never);

        const tools = getReadTools(orgId);
        const result1 = await tools.listTopValueProducts.execute!({ limit }, {} as never);
        const result2 = await tools.listTopValueProducts.execute!({ limit }, {} as never);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 }
    );
  });

  it("getInventorySummary: same inputs return equivalent results", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, async (orgId) => {
        const fakeProducts = makeFakeProducts(10).map(p => ({
          price: p.quantity as unknown as import("@prisma/client").Prisma.Decimal,
          quantity: p.quantity,
          lowStockAt: p.lowStockAt,
        }));
        mockFindMany.mockResolvedValue(fakeProducts as never);

        const tools = getReadTools(orgId);
        const result1 = await tools.getInventorySummary.execute!({}, {} as never);
        const result2 = await tools.getInventorySummary.execute!({}, {} as never);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: ai-agent-workflow, Property 2: Tool_Call Org Isolation

describe("Property 2: Tool_Call Org Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Validates: Requirements 1.6, 2.2, 11.2
   *
   * For any Tool_Call executed in the context of Organization A,
   * the returned results SHALL contain only data belonging to Organization A
   * and never data from any other Organization.
   */

  it("countProducts: queries are scoped to the correct organizationId", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, orgIdArb, nameFilterArb, async (orgA, orgB, nameFilter) => {
        // Ensure orgA and orgB are different
        fc.pre(orgA !== orgB);

        // Clear mocks at the start of each iteration to avoid accumulation
        vi.clearAllMocks();
        mockCount.mockResolvedValue(42);

        const tools = getReadTools(orgA);
        await tools.countProducts.execute!({ nameFilter }, {} as never);

        // Verify the mock was called with orgA in the where clause
        expect(mockCount).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              organizationId: orgA,
            }),
          })
        );

        // Verify it was NOT called with orgB
        const calls = mockCount.mock.calls;
        for (const call of calls) {
          const whereClause = call[0]?.where;
          expect(whereClause?.organizationId).toBe(orgA);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("listLowStockProducts: queries are scoped to the correct organizationId", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, orgIdArb, async (orgA, orgB) => {
        fc.pre(orgA !== orgB);

        // Clear mocks at the start of each iteration to avoid accumulation
        vi.clearAllMocks();

        const fakeProducts = makeFakeProducts(5).map(p => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: p.quantity,
          lowStockAt: p.lowStockAt,
        }));
        mockFindMany.mockResolvedValue(fakeProducts as never);

        const tools = getReadTools(orgA);
        await tools.listLowStockProducts.execute!({}, {} as never);

        // Verify all findMany calls (both internal calls) include orgA in the where clause
        const calls = mockFindMany.mock.calls;
        expect(calls.length).toBeGreaterThan(0);

        for (const call of calls) {
          const whereClause = call[0]?.where;
          expect(whereClause?.organizationId).toBe(orgA);
          expect(whereClause?.organizationId).not.toBe(orgB);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("getProductByName: queries are scoped to the correct organizationId", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, orgIdArb, productNameArb, async (orgA, orgB, name) => {
        fc.pre(orgA !== orgB);

        // Clear mocks at the start of each iteration to avoid accumulation
        vi.clearAllMocks();

        const fakeProduct = {
          id: "prod-1",
          name,
          sku: "SKU-1",
          quantity: 42,
          price: 9.99 as unknown as import("@prisma/client").Prisma.Decimal,
          lowStockAt: 5,
        };
        mockFindFirst.mockResolvedValue(fakeProduct as never);

        const tools = getReadTools(orgA);
        await tools.getProductByName.execute!({ name }, {} as never);

        // Verify the mock was called with orgA in the where clause
        expect(mockFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              organizationId: orgA,
            }),
          })
        );

        // Verify all calls used orgA (not orgB)
        const calls = mockFindFirst.mock.calls;
        for (const call of calls) {
          const whereClause = call[0]?.where;
          expect(whereClause?.organizationId).toBe(orgA);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("listTopValueProducts: queries are scoped to the correct organizationId", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, orgIdArb, limitArb, async (orgA, orgB, limit) => {
        fc.pre(orgA !== orgB);

        // Clear mocks at the start of each iteration to avoid accumulation
        vi.clearAllMocks();

        const fakeProducts = makeFakeProducts(20).map(p => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: p.quantity,
          price: p.quantity * 2 as unknown as import("@prisma/client").Prisma.Decimal,
        }));
        mockFindMany.mockResolvedValue(fakeProducts as never);

        const tools = getReadTools(orgA);
        await tools.listTopValueProducts.execute!({ limit }, {} as never);

        // Verify the mock was called with orgA in the where clause
        expect(mockFindMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              organizationId: orgA,
            }),
          })
        );

        // Verify all calls used orgA (not orgB)
        const calls = mockFindMany.mock.calls;
        for (const call of calls) {
          const whereClause = call[0]?.where;
          expect(whereClause?.organizationId).toBe(orgA);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("getInventorySummary: queries are scoped to the correct organizationId", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, orgIdArb, async (orgA, orgB) => {
        fc.pre(orgA !== orgB);

        // Clear mocks at the start of each iteration to avoid accumulation
        vi.clearAllMocks();

        const fakeProducts = makeFakeProducts(10).map(p => ({
          price: p.quantity as unknown as import("@prisma/client").Prisma.Decimal,
          quantity: p.quantity,
          lowStockAt: p.lowStockAt,
        }));
        mockFindMany.mockResolvedValue(fakeProducts as never);

        const tools = getReadTools(orgA);
        await tools.getInventorySummary.execute!({}, {} as never);

        // Verify the mock was called with orgA in the where clause
        expect(mockFindMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              organizationId: orgA,
            }),
          })
        );

        // Verify all calls used orgA (not orgB)
        const calls = mockFindMany.mock.calls;
        for (const call of calls) {
          const whereClause = call[0]?.where;
          expect(whereClause?.organizationId).toBe(orgA);
        }
      }),
      { numRuns: 100 }
    );
  });
});
