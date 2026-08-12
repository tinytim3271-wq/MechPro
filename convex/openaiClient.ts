/**
 * OpenAI client factory — prefers direct OPENAI_API_KEY on AWS,
 * falls back to the Hercules AI gateway for legacy deploys.
 */
import OpenAI from "openai";

export function getOpenAI(): OpenAI {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : {}),
    });
  }

  if (process.env.HERCULES_API_KEY) {
    return new OpenAI({
      baseURL: "https://ai-gateway.hercules.app/v1",
      apiKey: process.env.HERCULES_API_KEY,
    });
  }

  throw new Error("AI is not configured (set OPENAI_API_KEY or HERCULES_API_KEY)");
}
