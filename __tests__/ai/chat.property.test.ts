// Feature: ai-agent-workflow, Property 3: Chat Message Persistence Round-Trip

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Mock prisma before importing the module under test
vi.mock("@/lib/prisma", () => {
  const mockPrisma = {
    chatMessage: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    chatSession: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

// Mock redis — cache miss so it falls through to DB
vi.mock("@/lib/redis", () => {
  const mockRedis = {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  };
  return { redis: mockRedis };
});

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { persistMessages, getRecentMessages } from "../../lib/actions/ai/chat";

const mockCreateMany = vi.mocked(prisma.chatMessage.createMany);
const mockFindMany = vi.mocked(prisma.chatMessage.findMany);
const mockRedisGet = vi.mocked(redis.get);

// Arbitraries
const orgIdArb = fc.stringMatching(/^[a-z0-9]{8,16}$/);
const memberIdArb = fc.stringMatching(/^[a-z0-9]{8,16}$/);
const sessionIdArb = fc.stringMatching(/^[a-z0-9]{8,16}$/);

// Non-empty message content
const contentArb = fc.string({ minLength: 1, maxLength: 200 });

// A single message with role user or assistant
const messageArb = fc.record({
  role: fc.constantFrom("user", "assistant"),
  content: contentArb,
});

// A non-empty list of messages (1–10)
const messagesArb = fc.array(messageArb, { minLength: 1, maxLength: 10 });

describe("Property 3: Chat Message Persistence Round-Trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // redis.get always returns null (cache miss) so it falls through to DB
    mockRedisGet.mockResolvedValue(null);
  });

  /**
   * **Validates: Requirements 1.8, 3.1, 3.3**
   *
   * For any user message submitted to the chat interface, after the response is
   * received, querying the chat session history SHALL return a message record
   * with the same content, role, and a valid timestamp.
   */
  it("persisted messages are returned with matching content, role, and a valid timestamp", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        sessionIdArb,
        messagesArb,
        async (orgId, memberId, sessionId, messages) => {
          vi.clearAllMocks();
          mockRedisGet.mockResolvedValue(null);

          // createMany resolves successfully (void)
          mockCreateMany.mockResolvedValue({ count: messages.length });

          // Simulate what the DB would return: same messages with ids and timestamps
          const now = new Date();
          const dbRecords = messages.map((m, i) => ({
            id: `msg-${i}`,
            role: m.role,
            content: m.content,
            createdAt: now,
          }));

          // findMany returns records in reverse order (as the real query does orderBy desc),
          // then getRecentMessages reverses them back — so we provide them in desc order
          mockFindMany.mockResolvedValue([...dbRecords].reverse() as never);

          // Step 1: persist
          await persistMessages(orgId, memberId, sessionId, messages);

          // Step 2: retrieve
          const result = await getRecentMessages(orgId, memberId, sessionId);

          // Assert: same number of messages returned
          expect(result).toHaveLength(messages.length);

          // Assert: each returned record has matching content, role, and a valid timestamp
          for (let i = 0; i < messages.length; i++) {
            expect(result[i].role).toBe(messages[i].role);
            expect(result[i].content).toBe(messages[i].content);
            expect(result[i].createdAt).toBeInstanceOf(Date);
            expect(result[i].createdAt).not.toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("persistMessages calls createMany with the correct organizationId and sessionId", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        sessionIdArb,
        messagesArb,
        async (orgId, memberId, sessionId, messages) => {
          vi.clearAllMocks();
          mockRedisGet.mockResolvedValue(null);
          mockCreateMany.mockResolvedValue({ count: messages.length });

          await persistMessages(orgId, memberId, sessionId, messages);

          expect(mockCreateMany).toHaveBeenCalledOnce();
          const callArg = mockCreateMany.mock.calls[0]?.[0];
          expect(callArg).toBeDefined();
          const data = Array.isArray(callArg!.data) ? callArg!.data : [callArg!.data];
          for (const record of data) {
            expect(record.organizationId).toBe(orgId);
            expect(record.sessionId).toBe(sessionId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: ai-agent-workflow, Property 4: Chat History Bounded at 20

describe("Property 4: Chat History Bounded at 20", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
  });

  /**
   * **Validates: Requirements 1.9**
   *
   * For any chat session containing N messages (N ≥ 0), loading the chat
   * interface SHALL return exactly min(N, 20) messages, ordered by creation
   * timestamp ascending (oldest first), since getRecentMessages reverses the
   * DESC-ordered DB results.
   */
  it("returns exactly min(N, 20) messages for any N, ordered oldest-first", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        memberIdArb,
        sessionIdArb,
        fc.integer({ min: 0, max: 100 }),
        async (orgId, memberId, sessionId, n) => {
          vi.clearAllMocks();
          mockRedisGet.mockResolvedValue(null);

          const expectedCount = Math.min(n, 20);

          // Build N records with ascending timestamps
          const baseTime = new Date("2024-01-01T00:00:00Z").getTime();
          const allRecords = Array.from({ length: n }, (_, i) => ({
            id: `msg-${i}`,
            role: i % 2 === 0 ? "user" : "assistant",
            content: `message ${i}`,
            createdAt: new Date(baseTime + i * 1000),
          }));

          // The DB applies `take: 20` with `orderBy: desc`, so it returns the
          // last 20 records in descending order. Simulate that here.
          const descRecords = [...allRecords]
            .reverse()
            .slice(0, 20); // take: 20 from the desc-sorted list

          mockFindMany.mockResolvedValue(descRecords as never);

          const result = await getRecentMessages(orgId, memberId, sessionId);

          // Assert: exactly min(N, 20) messages returned
          expect(result).toHaveLength(expectedCount);

          // Assert: messages are in ascending order (oldest first) because
          // getRecentMessages calls .reverse() on the desc DB results
          for (let i = 1; i < result.length; i++) {
            expect(result[i].createdAt.getTime()).toBeGreaterThanOrEqual(
              result[i - 1].createdAt.getTime()
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
