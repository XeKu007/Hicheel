import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";

export function getAIModel() {
  const provider = process.env.AI_PROVIDER ?? "openai";

  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic");
    }
    return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })("claude-3-5-sonnet-20241022");
  }

  if (provider === "groq") {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is required when AI_PROVIDER=groq");
    }
    return createGroq({ apiKey: process.env.GROQ_API_KEY })("llama-3.1-8b-instant");
  }

  if (provider !== "openai") {
    console.warn(`[AI] Unknown AI_PROVIDER="${provider}", defaulting to openai`);
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
  }

  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })("gpt-4o-mini");
}
