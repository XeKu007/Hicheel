// Feature: ai-agent-workflow, Property 5: Rate Limit Enforcement

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Mock redis before importing the module under test
vi.mock("@/lib/redis", () => {
  const mockRedis = {
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(0),
    zadd: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  };
  return { redis: mockRedis };
});

import { redis } from "@/lib/redis";
import { checkOrgRateLimit } from "../../lib/ai/chat-rate-limit";

const mockZremrangebyscore = vi.mocked(redis.zremrangebyscore);
const mockZcard = vi.mocked(redis.zcard);
const mockZadd = vi.mocked(redis.zadd);
const mockExpire = vi.mocked(redis.expire);

// Arbitrary: valid org ID (alphanumeric, 8–24 chars)
const orgIdArb = fc.stringMatching(/^[a-z0-9]{8,24}$/);

// Arbitrary: request count below the limit (0–59)
const countBelowLimitArb = fc.integer({ min: 0, max: 59 });

// Arbitrary: request count at or above the limit (60–120)
const countAtOrAboveLimitArb = fc.integer({ min: 60, max: 120 });

// Arbitrary: boundary-focused counts (59, 60, 61, and random 0–100)
const boundaryCountArb = fc.oneof(
  fc.constant(59),
  fc.constant(60),
  fc.constant(61),
  fc.integer({ min: 0, max: 100 })
);

describe("Property 5: Rate Limit Enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockZremrangebyscore.mockResolvedValue(0);
    mockZadd.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
  });

  /**
   * **Validates: Requirements 1.11**
   *
   * For any Organization, after exactly 60 AI Assistant requests within a
   * single hour window, the 61st request SHALL receive an HTTP 429 response
   * containing a reset timestamp.
   *
   * Property: for any count < 60, checkOrgRateLimit returns null (allowed).
   */
  it("allows requests when the count is below 60", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, countBelowLimitArb, async (orgId, count) => {
        vi.clearAllMocks();
        mockZremrangebyscore.mockResolvedValue(0);
        mockZcard.mockResolvedValue(count as never);
        mockZadd.mockResolvedValue(1);
        mockExpire.mockResolvedValue(1);

        const result = await checkOrgRateLimit(orgId);

        // Must return null (request allowed)
        expect(result).toBeNull();

        // Must have added the new request to the sorted set
        expect(mockZadd).toHaveBeenCalledOnce();
        expect(mockExpire).toHaveBeenCalledOnce();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.11, 1.12**
   *
   * For any Organization, when the count is >= 60, checkOrgRateLimit SHALL
   * return a 429 NextResponse with body { error: "Rate limit exceeded", resetsAt: <ISO string> }.
   */
  it("returns 429 with resetsAt when the count is at or above 60", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, countAtOrAboveLimitArb, async (orgId, count) => {
        vi.clearAllMocks();
        mockZremrangebyscore.mockResolvedValue(0);
        mockZcard.mockResolvedValue(count as never);
        mockZadd.mockResolvedValue(1);
        mockExpire.mockResolvedValue(1);

        const result = await checkOrgRateLimit(orgId);

        // Must return a response (not null)
        expect(result).not.toBeNull();

        // Must be HTTP 429
        expect(result!.status).toBe(429);

        // Must not add a new entry (request rejected before zadd)
        expect(mockZadd).not.toHaveBeenCalled();

        // Body must contain error and resetsAt
        const body = await result!.json();
        expect(body.error).toBe("Rate limit exceeded");
        expect(typeof body.resetsAt).toBe("string");

        // resetsAt must be a valid ISO 8601 timestamp
        const resetDate = new Date(body.resetsAt);
        expect(resetDate.toString()).not.toBe("Invalid Date");

        // resetsAt must be in the future (approximately 1 hour from now)
        const now = Date.now();
        expect(resetDate.getTime()).toBeGreaterThan(now);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.11**
   *
   * Boundary test: exactly at the boundary (count = 59 → allowed, count = 60 → rejected).
   * This is the core of Property 5.
   */
  it("enforces the boundary: count=59 is allowed, count=60 is rejected", async () => {
    // count = 59 → allowed
    mockZcard.mockResolvedValue(59 as never);
    const allowed = await checkOrgRateLimit("test-org-boundary");
    expect(allowed).toBeNull();

    vi.clearAllMocks();
    mockZremrangebyscore.mockResolvedValue(0);
    mockZadd.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);

    // count = 60 → rejected
    mockZcard.mockResolvedValue(60 as never);
    const rejected = await checkOrgRateLimit("test-org-boundary");
    expect(rejected).not.toBeNull();
    expect(rejected!.status).toBe(429);
  });

  /**
   * **Validates: Requirements 1.11**
   *
   * The rate limit key is scoped to the organization:
   * different org IDs use different Redis keys.
   */
  it("uses org-scoped Redis keys", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, async (orgId) => {
        vi.clearAllMocks();
        mockZremrangebyscore.mockResolvedValue(0);
        mockZcard.mockResolvedValue(0 as never);
        mockZadd.mockResolvedValue(1);
        mockExpire.mockResolvedValue(1);

        await checkOrgRateLimit(orgId);

        const expectedKey = `rate_limit:org:${orgId}:ai-chat`;

        expect(mockZremrangebyscore).toHaveBeenCalledWith(
          expectedKey,
          expect.any(Number),
          expect.any(Number)
        );
        expect(mockZcard).toHaveBeenCalledWith(expectedKey);
        expect(mockZadd).toHaveBeenCalledWith(
          expectedKey,
          expect.objectContaining({ score: expect.any(Number) })
        );
        expect(mockExpire).toHaveBeenCalledWith(expectedKey, 3600);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.11**
   *
   * When Redis is unavailable (throws), the function should allow the request
   * (fail open) and return null.
   */
  it("allows requests when Redis is unavailable (fail open)", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, async (orgId) => {
        vi.clearAllMocks();
        mockZremrangebyscore.mockRejectedValue(new Error("Redis connection failed"));

        const result = await checkOrgRateLimit(orgId);

        // Must fail open — allow the request
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.11**
   *
   * Combined boundary property: for any count in 0–100, the result is null
   * iff count < 60, and a 429 response iff count >= 60.
   */
  it("correctly classifies all counts around the boundary", async () => {
    await fc.assert(
      fc.asyncProperty(orgIdArb, boundaryCountArb, async (orgId, count) => {
        vi.clearAllMocks();
        mockZremrangebyscore.mockResolvedValue(0);
        mockZcard.mockResolvedValue(count as never);
        mockZadd.mockResolvedValue(1);
        mockExpire.mockResolvedValue(1);

        const result = await checkOrgRateLimit(orgId);

        if (count < 60) {
          expect(result).toBeNull();
        } else {
          expect(result).not.toBeNull();
          expect(result!.status).toBe(429);
          const body = await result!.json();
          expect(body.error).toBe("Rate limit exceeded");
          expect(typeof body.resetsAt).toBe("string");
          expect(new Date(body.resetsAt).toString()).not.toBe("Invalid Date");
        }
      }),
      { numRuns: 100 }
    );
  });
});
