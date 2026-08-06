"use node";

import { v, ConvexError } from "convex/values";
import OpenAI from "openai";
import { action } from "./_generated/server";
import { requireAuthenticatedAction } from "./actionAuth";

// ─── Actions ──────────────────────────────────────────────────────────────────

export const generateSocialPost = action({
  args: {
    platform: v.union(
      v.literal("facebook"),
      v.literal("instagram"),
      v.literal("google"),
      v.literal("general")
    ),
    template: v.string(),
    businessName: v.string(),
    serviceOrTopic: v.string(),
    tone: v.union(v.literal("professional"), v.literal("friendly"), v.literal("urgent")),
    customContext: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ content: string; tags: string[] }> => {
    await requireAuthenticatedAction(ctx);
    const openai = new OpenAI({
      baseURL: "https://ai-gateway.hercules.app/v1",
      apiKey: process.env.HERCULES_API_KEY,
    });

    const platformGuide: Record<string, string> = {
      facebook: "Facebook post (engaging, 1-3 paragraphs, can use emojis, end with a call to action)",
      instagram:
        "Instagram caption (punchy opener, storytelling body, 5-10 relevant hashtags at the end)",
      google:
        "Google Business post (concise, 150-300 words, highlight the service/offer and location)",
      general: "general social media post (flexible format, good for any platform)",
    };

    const templateGuide: Record<string, string> = {
      promotion: "a special promotion or discount offer",
      seasonal: "a seasonal or holiday-themed marketing message",
      review_request: "a request asking satisfied customers to leave a review",
      service_spotlight: "spotlighting a specific service this business offers",
      tips: "helpful car maintenance tips that establish expertise",
      before_after: "a before/after story about a repair or transformation",
    };

    const systemPrompt = `You are an expert social media marketer for automotive repair and mobile mechanic businesses.
Write compelling, authentic social media content that drives customer engagement and bookings.
Tone: ${args.tone}. Keep it real, avoid corporate-speak.`;

    const userPrompt = `Write a ${platformGuide[args.platform]} for "${args.businessName}".
Template type: ${templateGuide[args.template] ?? args.template}.
Topic/Service: ${args.serviceOrTopic}.
${args.customContext ? `Additional context: ${args.customContext}` : ""}

Return ONLY a JSON object with two fields:
- "content": the full post text (with line breaks as \\n)
- "tags": array of 3-5 relevant topic tags (no hashtags, just words like ["oil-change", "mobile-mechanic"])`;

    try {
      const response = await openai.chat.completions.create({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as { content?: string; tags?: string[] };
      return {
        content: parsed.content ?? "",
        tags: parsed.tags ?? [],
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new Error(`AI Error: ${error.message}`);
      }
      throw new Error("Failed to generate post. Please try again.");
    }
  },
});
