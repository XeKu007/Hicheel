// Feature: ai-agent-workflow, Property 17: Write Tool_Call Role Enforcement
// Feature: ai-agent-workflow, Property 18: Write Tool_Call Audit Log
// Feature: ai-agent-workflow, Property 19: Write Tool_Call Cache Invalidation
// Feature: ai-agent-workflow, Property 20: createProduct Input Validation

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    product: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

vi.mock("@/lib/redis", () => ({
  invalidateCache: vi.fn(),
}));

vi.mock("@/lib/actions/audit", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/org", () => ({
  ROLE_HIERARCHY: {
    STAFF: 0,
    MANAGER: 1,
    SUPER_ADMIN: 2,
  },
}));

import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";
import { writeAuditLog } from "@/lib/actions/audit";
import { getWriteTools, createProductSchema } from "../../lib/ai/tools/write";

// ── Typed mock helpers ─────────────────────────────────────────────────────

const mockCreate = vi.mocked(prisma.product.create);
const mockFindFirst = vi.mocked(prisma.product.findFirst);
const mockUpdate = vi.mocked(prisma.product.update);
const mockDelete = vi.mocked(prisma.product.delete);
const mockInvalidateCache = vi.mocked(invalidateCache);
const mockWriteAuditLog = vi.mocked(writeAuditLog);

// ── Arbitraries ────────────────────────────────────────────────────────────

const orgIdArb = fc.stringMatching(/^[a-z0-9]{8,16}$/);
const memberIdArb = fc.stringMatching(/^[a-z0-9]{8,16}$/);
const productNameArb = fc.string({ minLength: 1, maxLength: 40 });
const quantityArb = fc.integer({ min: 0, max: 1000 });
const priceArb = fc.float({ min: 0, max: 9999, noNaN: true });

function makeFakeProduct(name: string) {
  return {
    id: "fake-id-123",
    name,
    quantity: 10,
    price: 9.99 as unknown as import("@prisma/client").Prisma.Decimal,
  };
}

// ── Property 17: Write Tool_Call Role Enforcement ──────────────────────────

describe("Property 17: Write Tool_Call Role Enforcement", () => {
  /**
   * Validates: Requirements 13.2
   *
   * For any write tool call with STAFF role, the result should contain
   * { error: ... } and NO prisma mutations should occur.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createProduct: STAFF role returns error and does not call prisma.product.create", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        quantityArb,
        priceArb,
        async (orgId, memberId, name, quantity, price) => {
          vi.clearAllMocks();

          const tools = getWriteTools(orgId, memberId, "STAFF");
          const result = await tools.createProduct.execute!(
            { name, quantity, price },
            {} as never
          );

          expect(result).toHaveProperty("error");
          expect(mockCreate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("updateProduct: STAFF role returns error and does not call prisma.product.update", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        async (orgId, memberId, name) => {
          vi.clearAllMocks();

          const tools = getWriteTools(orgId, memberId, "STAFF");
          const result = await tools.updateProduct.execute!(
            { name, updates: { quantity: 5 } },
            {} as never
          );

          expect(result).toHaveProperty("error");
          expect(mockUpdate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("deleteProduct: STAFF role returns error and does not call prisma.product.delete", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        async (orgId, memberId, name) => {
          vi.clearAllMocks();

          const tools = getWriteTools(orgId, memberId, "STAFF");
          const result = await tools.deleteProduct.execute!(
            { name },
            {} as never
          );

          expect(result).toHaveProperty("error");
          expect(mockDelete).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 18: Write Tool_Call Audit Log ─────────────────────────────────

describe("Property 18: Write Tool_Call Audit Log", () => {
  /**
   * Validates: Requirements 13.7
   *
   * For any successfully executed write tool, exactly one AuditLog entry
   * is created with the correct actionType and entityType="Product".
   */

  beforeEach(() => {
    vi.clearAllMocks();
    // writeAuditLog is fire-and-forget (void), resolve immediately
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("createProduct: writeAuditLog called exactly once with CREATE and entityType=Product", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        quantityArb,
        priceArb,
        async (orgId, memberId, name, quantity, price) => {
          vi.clearAllMocks();
          mockWriteAuditLog.mockResolvedValue(undefined);
          mockInvalidateCache.mockResolvedValue(undefined);

          const fakeProduct = makeFakeProduct(name);
          mockCreate.mockResolvedValue(fakeProduct as never);

          const tools = getWriteTools(orgId, memberId, "MANAGER");
          await tools.createProduct.execute!({ name, quantity, price }, {} as never);

          // Allow the fire-and-forget void promise to settle
          await new Promise((r) => setTimeout(r, 0));

          expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
          expect(mockWriteAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
              actionType: "CREATE",
              entityType: "Product",
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("updateProduct: writeAuditLog called exactly once with UPDATE and entityType=Product", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        async (orgId, memberId, name) => {
          vi.clearAllMocks();
          mockWriteAuditLog.mockResolvedValue(undefined);
          mockInvalidateCache.mockResolvedValue(undefined);

          const fakeProduct = makeFakeProduct(name);
          mockFindFirst.mockResolvedValue(fakeProduct as never);
          mockUpdate.mockResolvedValue({ ...fakeProduct, quantity: 99 } as never);

          const tools = getWriteTools(orgId, memberId, "MANAGER");
          await tools.updateProduct.execute!(
            { name, updates: { quantity: 99 } },
            {} as never
          );

          await new Promise((r) => setTimeout(r, 0));

          expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
          expect(mockWriteAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
              actionType: "UPDATE",
              entityType: "Product",
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("deleteProduct: writeAuditLog called exactly once with DELETE and entityType=Product", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        async (orgId, memberId, name) => {
          vi.clearAllMocks();
          mockWriteAuditLog.mockResolvedValue(undefined);
          mockInvalidateCache.mockResolvedValue(undefined);

          const fakeProduct = makeFakeProduct(name);
          mockFindFirst.mockResolvedValue(fakeProduct as never);
          mockDelete.mockResolvedValue(fakeProduct as never);

          const tools = getWriteTools(orgId, memberId, "MANAGER");
          await tools.deleteProduct.execute!({ name }, {} as never);

          await new Promise((r) => setTimeout(r, 0));

          expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
          expect(mockWriteAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
              actionType: "DELETE",
              entityType: "Product",
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 19: Write Tool_Call Cache Invalidation ────────────────────────

describe("Property 19: Write Tool_Call Cache Invalidation", () => {
  /**
   * Validates: Requirements 13.12
   *
   * For any successfully executed write tool, invalidateCache is called
   * with keys containing org:{organizationId}:dashboard and
   * org:{organizationId}:inventory:*.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("createProduct: invalidateCache called with both required cache keys", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        quantityArb,
        priceArb,
        async (orgId, memberId, name, quantity, price) => {
          vi.clearAllMocks();
          mockWriteAuditLog.mockResolvedValue(undefined);
          mockInvalidateCache.mockResolvedValue(undefined);

          const fakeProduct = makeFakeProduct(name);
          mockCreate.mockResolvedValue(fakeProduct as never);

          const tools = getWriteTools(orgId, memberId, "MANAGER");
          await tools.createProduct.execute!({ name, quantity, price }, {} as never);

          expect(mockInvalidateCache).toHaveBeenCalledTimes(1);
          const [keys] = mockInvalidateCache.mock.calls[0];
          expect(keys).toContain(`org:${orgId}:dashboard`);
          expect(keys).toContain(`org:${orgId}:inventory:*`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("updateProduct: invalidateCache called with both required cache keys", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        async (orgId, memberId, name) => {
          vi.clearAllMocks();
          mockWriteAuditLog.mockResolvedValue(undefined);
          mockInvalidateCache.mockResolvedValue(undefined);

          const fakeProduct = makeFakeProduct(name);
          mockFindFirst.mockResolvedValue(fakeProduct as never);
          mockUpdate.mockResolvedValue({ ...fakeProduct, quantity: 5 } as never);

          const tools = getWriteTools(orgId, memberId, "MANAGER");
          await tools.updateProduct.execute!(
            { name, updates: { quantity: 5 } },
            {} as never
          );

          expect(mockInvalidateCache).toHaveBeenCalledTimes(1);
          const [keys] = mockInvalidateCache.mock.calls[0];
          expect(keys).toContain(`org:${orgId}:dashboard`);
          expect(keys).toContain(`org:${orgId}:inventory:*`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("deleteProduct: invalidateCache called with both required cache keys", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        async (orgId, memberId, name) => {
          vi.clearAllMocks();
          mockWriteAuditLog.mockResolvedValue(undefined);
          mockInvalidateCache.mockResolvedValue(undefined);

          const fakeProduct = makeFakeProduct(name);
          mockFindFirst.mockResolvedValue(fakeProduct as never);
          mockDelete.mockResolvedValue(fakeProduct as never);

          const tools = getWriteTools(orgId, memberId, "MANAGER");
          await tools.deleteProduct.execute!({ name }, {} as never);

          expect(mockInvalidateCache).toHaveBeenCalledTimes(1);
          const [keys] = mockInvalidateCache.mock.calls[0];
          expect(keys).toContain(`org:${orgId}:dashboard`);
          expect(keys).toContain(`org:${orgId}:inventory:*`);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 20: createProduct Input Validation ────────────────────────────

describe("Property 20: createProduct Input Validation", () => {
  /**
   * Validates: Requirements 13.9, 13.10
   *
   * For any createProduct call where name is empty, quantity is negative,
   * or price is negative, the Zod schema should reject the input (throw).
   * prisma.product.create must NOT be called.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty name via Zod schema", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        quantityArb,
        priceArb,
        async (orgId, memberId, quantity, price) => {
          vi.clearAllMocks();

          expect(() =>
            createProductSchema.parse({ name: "", quantity, price })
          ).toThrow();

          expect(mockCreate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects negative quantity via Zod schema", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        fc.integer({ min: -100, max: -1 }),
        priceArb,
        async (orgId, memberId, name, negativeQty, price) => {
          vi.clearAllMocks();

          expect(() =>
            createProductSchema.parse({ name, quantity: negativeQty, price })
          ).toThrow();

          expect(mockCreate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects negative price via Zod schema", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        productNameArb,
        quantityArb,
        fc.float({ min: -100, max: Math.fround(-0.01), noNaN: true }),
        async (orgId, memberId, name, quantity, negativePrice) => {
          vi.clearAllMocks();

          expect(() =>
            createProductSchema.parse({ name, quantity, price: negativePrice })
          ).toThrow();

          expect(mockCreate).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
