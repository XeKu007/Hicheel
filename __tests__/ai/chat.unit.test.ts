/**
 * Unit tests for app/api/ai/chat/route.ts
 * Requirements: 3.2, 3.5, 1.10, 1.7, 1.11, 1.12
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// --- Mocks ---

vi.mock("@/lib/org", () => ({
  getOrgContext: vi.fn(),
}));

vi.mock("@/lib/actions/ai/chat", () => ({
  getOrCreateSession: vi.fn(),
  getRecentMessages: vi.fn(),
  persistMessages: vi.fn(),
}));

vi.mock("@/lib/ai/chat-rate-limit", () => ({
  checkOrgRateLimit: vi.fn(),
}));

vi.mock("@/lib/ai/provider", () => ({
  getAIModel: vi.fn(),
}));

vi.mock("@/lib/ai/tools/read", () => ({
  getReadTools: vi.fn(),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

// write tools are dynamically imported — mock the module
vi.mock("@/lib/ai/tools/write", () => ({
  getWriteTools: vi.fn().mockReturnValue({}),
}));

import { getOrgContext } from "@/lib/org";
import {
  getOrCreateSession,
  getRecentMessages,
  persistMessages,
} from "@/lib/actions/ai/chat";
import { checkOrgRateLimit } from "@/lib/ai/chat-rate-limit";
import { getAIModel } from "@/lib/ai/provider";
import { getReadTools } from "@/lib/ai/tools/read";
import { streamText } from "ai";

import { POST } from "../../app/api/ai/chat/route";

// Typed mocks
const mockGetOrgContext = vi.mocked(getOrgContext);
const mockGetOrCreateSession = vi.mocked(getOrCreateSession);
const mockGetRecentMessages = vi.mocked(getRecentMessages);
const mockPersistMessages = vi.mocked(persistMessages);
const mockCheckOrgRateLimit = vi.mocked(checkOrgRateLimit);
const mockGetAIModel = vi.mocked(getAIModel);
const mockGetReadTools = vi.mocked(getReadTools);
const mockStreamText = vi.mocked(streamText);

// Shared fake org context (STAFF role — no write tools)
const fakeOrgContext = {
  organizationId: "org-abc123",
  memberId: "member-xyz789",
  role: "STAFF" as const,
  userId: "user-111",
  orgName: "Test Org",
  locale: "en" as const,
};

// Helper: build a POST Request with a JSON body
function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Helper: build a mock streamText result
function mockStreamResult(sessionHeader?: string) {
  const mockResponse = new Response("data: hello\n\n", {
    status: 200,
    headers: sessionHeader ? { "X-Session-Id": sessionHeader } : {},
  });
  return {
    toDataStreamResponse: vi.fn().mockReturnValue(mockResponse),
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default happy-path setup
  mockGetOrgContext.mockResolvedValue(fakeOrgContext);
  mockCheckOrgRateLimit.mockResolvedValue(null); // allowed
  mockGetOrCreateSession.mockResolvedValue("session-new-001");
  mockGetRecentMessages.mockResolvedValue([]);
  mockPersistMessages.mockResolvedValue(undefined);
  mockGetAIModel.mockReturnValue({} as ReturnType<typeof getAIModel>);
  mockGetReadTools.mockReturnValue({} as ReturnType<typeof getReadTools>);
  mockStreamText.mockReturnValue(mockStreamResult("session-new-001") as never);
});

// ---------------------------------------------------------------------------
// Test 1: New session created on first message (Req 3.2, 3.6)
// ---------------------------------------------------------------------------
describe("new session created on first message", () => {
  it("calls getOrCreateSession when no sessionId is provided and uses the returned id", async () => {
    mockGetOrCreateSession.mockResolvedValue("session-brand-new");
    mockStreamText.mockReturnValue(mockStreamResult("session-brand-new") as never);

    const req = makeRequest({ message: "Hello" });
    const res = await POST(req as never);

    // getOrCreateSession must have been called with the org + member ids
    expect(mockGetOrCreateSession).toHaveBeenCalledOnce();
    expect(mockGetOrCreateSession).toHaveBeenCalledWith(
      fakeOrgContext.organizationId,
      fakeOrgContext.memberId
    );

    // The response should be the stream response (status 200)
    expect(res.status).toBe(200);
  });

  it("does NOT call getOrCreateSession when a sessionId is already provided", async () => {
    const req = makeRequest({ message: "Hello", sessionId: "existing-session-999" });
    await POST(req as never);

    expect(mockGetOrCreateSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 2: Cache key invalidated after save (Req 3.5)
// ---------------------------------------------------------------------------
describe("cache invalidated after stream completes", () => {
  it("calls persistMessages (which invalidates the cache) via onFinish callback", async () => {
    // Capture the onFinish callback passed to streamText
    let capturedOnFinish: ((args: { text: string }) => Promise<void>) | undefined;

    mockStreamText.mockImplementation((opts: Record<string, unknown>) => {
      capturedOnFinish = opts.onFinish as typeof capturedOnFinish;
      return mockStreamResult("session-new-001") as never;
    });

    const req = makeRequest({ message: "What is my stock level?" });
    await POST(req as never);

    // onFinish should have been registered
    expect(capturedOnFinish).toBeDefined();

    // Simulate the stream finishing
    await capturedOnFinish!({ text: "Your stock level is 42." });

    expect(mockPersistMessages).toHaveBeenCalledOnce();
    expect(mockPersistMessages).toHaveBeenCalledWith(
      fakeOrgContext.organizationId,
      fakeOrgContext.memberId,
      "session-new-001",
      [
        { role: "user", content: "What is my stock level?" },
        { role: "assistant", content: "Your stock level is 42." },
      ]
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: AI provider error returns safe message (Req 1.10)
// ---------------------------------------------------------------------------
describe("AI provider error handling", () => {
  it("returns 500 with a safe error message when streamText throws", async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error("OpenAI API key invalid");
    });

    const req = makeRequest({ message: "Hello" });
    const res = await POST(req as never);

    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body).toEqual({
      error: "AI service temporarily unavailable. Please try again.",
    });

    // Original error must NOT be exposed
    expect(JSON.stringify(body)).not.toContain("OpenAI API key invalid");
  });

  it("returns 500 safe message when getAIModel throws", async () => {
    mockGetAIModel.mockImplementation(() => {
      throw new Error("OPENAI_API_KEY is required");
    });

    const req = makeRequest({ message: "Hello" });
    const res = await POST(req as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("AI service temporarily unavailable. Please try again.");
  });
});

// ---------------------------------------------------------------------------
// Test 4: Rate limit exceeded returns 429 (Req 1.11, 1.12)
// ---------------------------------------------------------------------------
describe("rate limit enforcement", () => {
  it("returns the 429 response from checkOrgRateLimit directly", async () => {
    const rateLimitResponse = NextResponse.json(
      { error: "Rate limit exceeded", resetsAt: "2099-01-01T00:00:00.000Z" },
      { status: 429 }
    );
    mockCheckOrgRateLimit.mockResolvedValue(rateLimitResponse);

    const req = makeRequest({ message: "Hello" });
    const res = await POST(req as never);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Rate limit exceeded");

    // Stream should never be started
    expect(mockStreamText).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 5: Streaming delivers response (Req 1.7)
// ---------------------------------------------------------------------------
describe("streaming response", () => {
  it("returns the data stream response from streamText", async () => {
    const fakeStreamResponse = new Response("data: chunk1\n\ndata: chunk2\n\n", {
      status: 200,
      headers: { "X-Session-Id": "session-new-001" },
    });
    mockStreamText.mockReturnValue({
      toDataStreamResponse: vi.fn().mockReturnValue(fakeStreamResponse),
    } as never);

    const req = makeRequest({ message: "List my products" });
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledOnce();
  });

  it("passes message history and current message to streamText", async () => {
    const history = [
      { id: "h1", role: "user", content: "Hi", createdAt: new Date() },
      { id: "h2", role: "assistant", content: "Hello!", createdAt: new Date() },
    ];
    mockGetRecentMessages.mockResolvedValue(history);

    const req = makeRequest({ message: "How many products?", sessionId: "sess-existing" });
    await POST(req as never);

    const callArgs = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
    const messages = callArgs.messages as Array<{ role: string; content: string }>;

    // History + current message
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: "user", content: "Hi" });
    expect(messages[1]).toEqual({ role: "assistant", content: "Hello!" });
    expect(messages[2]).toEqual({ role: "user", content: "How many products?" });
  });
});

// ---------------------------------------------------------------------------
// Test 6: Missing / empty message returns 400
// ---------------------------------------------------------------------------
describe("input validation", () => {
  it("returns 400 when message is missing", async () => {
    const req = makeRequest({});
    const res = await POST(req as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Message is required");
  });

  it("returns 400 when message is empty string", async () => {
    const req = makeRequest({ message: "   " });
    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });
});
