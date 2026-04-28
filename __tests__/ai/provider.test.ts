import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the AI SDK modules before importing provider
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ provider: "openai", model }))),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ provider: "anthropic", model }))),
}));

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getAIModel } from "../../lib/ai/provider";

describe("getAIModel()", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env and mocks before each test
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Req 10.2: AI_PROVIDER=openai uses gpt-4o
  it("returns OpenAI gpt-4o model when AI_PROVIDER=openai and OPENAI_API_KEY is set", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-openai-key";

    const model = getAIModel();

    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "sk-test-openai-key" });
    const mockInstance = vi.mocked(createOpenAI).mock.results[0].value;
    expect(mockInstance).toHaveBeenCalledWith("gpt-4o");
    expect(model).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  // Req 10.3: AI_PROVIDER=anthropic uses claude-3-5-sonnet-20241022
  it("returns Anthropic claude-3-5-sonnet model when AI_PROVIDER=anthropic and ANTHROPIC_API_KEY is set", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

    const model = getAIModel();

    expect(createAnthropic).toHaveBeenCalledWith({ apiKey: "sk-ant-test-key" });
    const mockInstance = vi.mocked(createAnthropic).mock.results[0].value;
    expect(mockInstance).toHaveBeenCalledWith("claude-3-5-sonnet-20241022");
    expect(model).toEqual({ provider: "anthropic", model: "claude-3-5-sonnet-20241022" });
  });

  // Req 10.4: defaults to openai when AI_PROVIDER is not set
  it("defaults to OpenAI when AI_PROVIDER is not set", () => {
    process.env.OPENAI_API_KEY = "sk-test-openai-key";
    // AI_PROVIDER is not set

    const model = getAIModel();

    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "sk-test-openai-key" });
    expect(model).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  // Req 10.4: logs warning and defaults to openai for unknown provider
  it("logs a warning and defaults to openai when AI_PROVIDER is an unknown value", () => {
    process.env.AI_PROVIDER = "unknown-provider";
    process.env.OPENAI_API_KEY = "sk-test-openai-key";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const model = getAIModel();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("unknown-provider")
    );
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "sk-test-openai-key" });
    expect(model).toEqual({ provider: "openai", model: "gpt-4o" });

    warnSpy.mockRestore();
  });

  // Req 10.5: throws descriptive error when OPENAI_API_KEY is missing
  it("throws a descriptive error when OPENAI_API_KEY is missing and AI_PROVIDER=openai", () => {
    process.env.AI_PROVIDER = "openai";
    // OPENAI_API_KEY is not set

    expect(() => getAIModel()).toThrowError(/OPENAI_API_KEY/);
  });

  // Req 10.5: throws descriptive error when ANTHROPIC_API_KEY is missing
  it("throws a descriptive error when ANTHROPIC_API_KEY is missing and AI_PROVIDER=anthropic", () => {
    process.env.AI_PROVIDER = "anthropic";
    // ANTHROPIC_API_KEY is not set

    expect(() => getAIModel()).toThrowError(/ANTHROPIC_API_KEY/);
  });
});
