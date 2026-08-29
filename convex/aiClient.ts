/**
 * Unified AI client — AWS Bedrock primary, OpenAI direct for local dev fallback.
 * Replaces the Hercules AI gateway which blocks automotive repair prompts.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import OpenAI from "openai";

export type AiTier = "primary" | "fast";

const PRIMARY_MODEL =
  process.env.AI_MODEL_PRIMARY ??
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const FAST_MODEL =
  process.env.AI_MODEL_FAST ?? "us.amazon.nova-lite-v1:0";

const OPENAI_PRIMARY = process.env.OPENAI_MODEL_PRIMARY ?? "gpt-4o";
const OPENAI_FAST = process.env.OPENAI_MODEL_FAST ?? "gpt-4o-mini";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function modelForTier(tier: AiTier): string {
  return tier === "fast" ? FAST_MODEL : PRIMARY_MODEL;
}

function openAiModelForTier(tier: AiTier): string {
  return tier === "fast" ? OPENAI_FAST : OPENAI_PRIMARY;
}

function useBedrock(): boolean {
  if (process.env.AI_PROVIDER === "openai") return false;
  if (process.env.AI_PROVIDER === "bedrock") return true;
  if (process.env.OPENAI_API_KEY && !process.env.AWS_REGION) return false;
  return true;
}

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrock(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
  }
  return bedrockClient;
}

function getOpenAiDirect(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "AI is not configured. Set AWS Bedrock access (Lambda IAM) or OPENAI_API_KEY for local dev.",
    );
  }
  return new OpenAI({
    apiKey: key,
    ...(process.env.OPENAI_BASE_URL
      ? { baseURL: process.env.OPENAI_BASE_URL }
      : {}),
  });
}

function toBedrockMessages(messages: ChatMessage[]): {
  system: { text: string }[];
  messages: Message[];
} {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => ({ text: m.content }));
  const converseMessages: Message[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ text: m.content }],
    }));
  return { system, messages: converseMessages };
}

async function bedrockChat(
  messages: ChatMessage[],
  tier: AiTier,
): Promise<string> {
  const client = getBedrock();
  const modelId = modelForTier(tier);
  const { system, messages: converseMessages } = toBedrockMessages(messages);

  const response = await client.send(
    new ConverseCommand({
      modelId,
      system: system.length > 0 ? system : undefined,
      messages: converseMessages,
      inferenceConfig: { maxTokens: 4096, temperature: 0.3 },
    }),
  );

  const parts = response.output?.message?.content ?? [];
  const text = parts
    .map((p) => ("text" in p ? p.text : ""))
    .filter(Boolean)
    .join("");
  if (!text) {
    throw new Error("Bedrock returned an empty response");
  }
  return text;
}

async function openAiChat(
  messages: ChatMessage[],
  tier: AiTier,
  jsonMode?: boolean,
): Promise<string> {
  const openai = getOpenAiDirect();
  const response = await openai.chat.completions.create({
    model: openAiModelForTier(tier),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }
  return content;
}

/** Run a chat completion and return the assistant text. */
export async function chatCompletion(options: {
  messages: ChatMessage[];
  tier?: AiTier;
  jsonMode?: boolean;
}): Promise<string> {
  const { messages, tier = "primary", jsonMode } = options;
  if (useBedrock()) {
    return bedrockChat(messages, tier);
  }
  return openAiChat(messages, tier, jsonMode);
}

/** Parse JSON from an AI response, stripping markdown fences. */
export function parseAiJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
