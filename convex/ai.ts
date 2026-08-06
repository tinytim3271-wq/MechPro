"use node";

import { v } from "convex/values";
import OpenAI from "openai";
import { action, internalAction } from "./_generated/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { requireAuthenticatedAction } from "./actionAuth";

function getOpenAI() {
  return new OpenAI({
    baseURL: "https://ai-gateway.hercules.app/v1",
    apiKey: process.env.HERCULES_API_KEY,
  });
}

// ─── AI Diagnostics ───────────────────────────────────────────────────────────

export const diagnose = action({
  args: {
    symptoms: v.string(),
    dtcCodes: v.optional(v.string()),
    vehicle: v.string(), // "2018 Ford F-150 5.0L V8"
  },
  handler: async (ctx, args): Promise<{
    probableCauses: Array<{ cause: string; likelihood: string; explanation: string }>;
    recommendedTests: string[];
    urgency: string;
    estimatedLaborHours: number;
    additionalNotes: string;
  }> => {
    await requireAuthenticatedAction(ctx);
    const openai = getOpenAI();

    const prompt = `You are an expert automotive diagnostic technician. Analyze the following vehicle symptoms and provide a detailed diagnosis.

Vehicle: ${args.vehicle}
Symptoms: ${args.symptoms}${args.dtcCodes ? `\nDTC Codes: ${args.dtcCodes}` : ""}

Respond ONLY with valid JSON matching this exact structure:
{
  "probableCauses": [
    { "cause": "string", "likelihood": "High|Medium|Low", "explanation": "string" }
  ],
  "recommendedTests": ["string"],
  "urgency": "Immediate|Soon|Monitor",
  "estimatedLaborHours": number,
  "additionalNotes": "string"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "openai/gpt-5.6-luna",
        reasoning_effort: "low",
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned) as {
        probableCauses: Array<{ cause: string; likelihood: string; explanation: string }>;
        recommendedTests: string[];
        urgency: string;
        estimatedLaborHours: number;
        additionalNotes: string;
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new ConvexError({ message: `AI Error: ${error.message}`, code: "EXTERNAL_SERVICE_ERROR" });
      }
      throw new ConvexError({ message: "Failed to run diagnostics", code: "EXTERNAL_SERVICE_ERROR" });
    }
  },
});

// ─── AI Estimator ─────────────────────────────────────────────────────────────

export const estimate = action({
  args: {
    vehicle: v.string(), // "2018 Ford F-150 5.0L V8"
    services: v.string(), // "Brake pad replacement front and rear"
    region: v.optional(v.string()), // "Texas"
  },
  handler: async (ctx, args): Promise<{
    lineItems: Array<{
      service: string;
      laborHours: number;
      laborCost: number;
      partsCost: number;
      total: number;
      notes: string;
    }>;
    subtotal: number;
    summary: string;
  }> => {
    await requireAuthenticatedAction(ctx);
    const openai = getOpenAI();

    const prompt = `You are an expert auto repair estimator. Create a detailed estimate for the following:

Vehicle: ${args.vehicle}
Services Requested: ${args.services}${args.region ? `\nRegion: ${args.region}` : ""}

Use a labor rate of $120/hr. Provide realistic market-rate parts costs.

Respond ONLY with valid JSON matching this exact structure:
{
  "lineItems": [
    {
      "service": "string",
      "laborHours": number,
      "laborCost": number,
      "partsCost": number,
      "total": number,
      "notes": "string"
    }
  ],
  "subtotal": number,
  "summary": "string"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "openai/gpt-5.6-luna",
        reasoning_effort: "low",
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned) as {
        lineItems: Array<{
          service: string;
          laborHours: number;
          laborCost: number;
          partsCost: number;
          total: number;
          notes: string;
        }>;
        subtotal: number;
        summary: string;
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new ConvexError({ message: `AI Error: ${error.message}`, code: "EXTERNAL_SERVICE_ERROR" });
      }
      throw new ConvexError({ message: "Failed to generate estimate", code: "EXTERNAL_SERVICE_ERROR" });
    }
  },
});

// ─── AI Repair Guide ──────────────────────────────────────────────────────────

export const repairGuide = action({
  args: {
    vehicle: v.string(),
    repair: v.string(),
  },
  handler: async (ctx, args): Promise<{
    title: string;
    difficulty: string;
    estimatedTime: string;
    toolsRequired: string[];
    partsNeeded: string[];
    steps: Array<{ stepNumber: number; title: string; details: string; warning?: string }>;
    safetyNotes: string[];
    proTips: string[];
  }> => {
    await requireAuthenticatedAction(ctx);
    const openai = getOpenAI();

    const prompt = `You are an expert automotive technician. Provide a detailed step-by-step repair guide for:

Vehicle: ${args.vehicle}
Repair: ${args.repair}

Respond ONLY with valid JSON matching this exact structure:
{
  "title": "string",
  "difficulty": "Beginner|Intermediate|Advanced|Expert",
  "estimatedTime": "string",
  "toolsRequired": ["string"],
  "partsNeeded": ["string"],
  "steps": [
    { "stepNumber": number, "title": "string", "details": "string", "warning": "string or omit" }
  ],
  "safetyNotes": ["string"],
  "proTips": ["string"]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "openai/gpt-5.6-luna",
        reasoning_effort: "low",
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned) as {
        title: string;
        difficulty: string;
        estimatedTime: string;
        toolsRequired: string[];
        partsNeeded: string[];
        steps: Array<{ stepNumber: number; title: string; details: string; warning?: string }>;
        safetyNotes: string[];
        proTips: string[];
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new ConvexError({ message: `AI Error: ${error.message}`, code: "EXTERNAL_SERVICE_ERROR" });
      }
      throw new ConvexError({ message: "Failed to generate repair guide", code: "EXTERNAL_SERVICE_ERROR" });
    }
  },
});

// ─── AI Phone Assistant ───────────────────────────────────────────────────────
// Accepts a customer call transcript, returns service recommendation + estimated cost

export const phoneAssistant = action({
  args: {
    transcript: v.string(),
    shopName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    customerName: string;
    vehicle: string;
    symptoms: string;
    recommendedServices: Array<{ service: string; estimatedCost: string; urgency: string }>;
    suggestedResponse: string;
    followUpQuestions: string[];
    bookingRecommended: boolean;
  }> => {
    await requireAuthenticatedAction(ctx);
    const openai = getOpenAI();

    const prompt = `You are an AI phone assistant for ${args.shopName ?? "an auto repair shop"}. Analyze this customer call transcript and extract key information to help the service writer.

Transcript:
${args.transcript}

Respond ONLY with valid JSON matching this exact structure:
{
  "customerName": "string or Unknown",
  "vehicle": "string or Unknown",
  "symptoms": "string",
  "recommendedServices": [
    { "service": "string", "estimatedCost": "string e.g. $150-$300", "urgency": "Immediate|Soon|Routine" }
  ],
  "suggestedResponse": "string - what to tell the customer",
  "followUpQuestions": ["string"],
  "bookingRecommended": boolean
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "openai/gpt-5.6-luna",
        reasoning_effort: "low",
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned) as {
        customerName: string;
        vehicle: string;
        symptoms: string;
        recommendedServices: Array<{ service: string; estimatedCost: string; urgency: string }>;
        suggestedResponse: string;
        followUpQuestions: string[];
        bookingRecommended: boolean;
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new ConvexError({ message: `AI Error: ${error.message}`, code: "EXTERNAL_SERVICE_ERROR" });
      }
      throw new ConvexError({ message: "Failed to process call transcript", code: "EXTERNAL_SERVICE_ERROR" });
    }
  },
});

// ─── AI Workflow Builder ─────────────────────────────────────────────────────
// Combined action: generates estimate, diagnostic checklist, and repair procedure
// from a single RO complaint + vehicle info. Auto-populates the RO.
// Spec requirements: <3s target, ambiguity detection, tools per step, probable causes,
// part numbers, shop fees, recommended services, verification criteria.

export const generateWorkflow = internalAction({
  args: {
    roId: v.id("repairOrders"),
  },
  handler: async (ctx, args): Promise<void> => {
    // Mark as generating
    await ctx.runMutation(internal.repairOrders.patchROInternal, {
      roId: args.roId,
      fields: { aiWorkflowStatus: "generating" },
    });

    // Fetch RO + vehicle + org data
    const data = await ctx.runQuery(internal.repairOrders.getROWorkflowData, { roId: args.roId });
    if (!data) {
      await ctx.runMutation(internal.repairOrders.patchROInternal, {
        roId: args.roId,
        fields: { aiWorkflowStatus: "failed" },
      });
      return;
    }

    const { complaint, vehicle, laborRate, taxRate } = data;
    const openai = getOpenAI();

    const prompt = `You are an expert ASE-certified master automotive technician and service writer with access to industry labor guides (Mitchell, AllData). Analyze the following and generate a complete workflow.

Vehicle: ${vehicle}
Customer Complaint: "${complaint}"
Shop Labor Rate: $${laborRate}/hr

Generate a comprehensive response. Follow these rules strictly:
- Labor rates MUST use $${laborRate}/hr
- Parts unitPrice should include 40-60% markup over unitCost
- Include realistic part numbers where known (OEM or aftermarket)
- Diagnostic checklist: 4-8 items covering visual inspections, electrical tests, mechanical tests, scan tool procedures, and measurements (voltage, pressure, resistance)
- Each diagnostic item must include what tools/equipment are needed and what result confirms the failure
- Repair checklist: detailed steps with required tools, torque specs where applicable, safety warnings, and final road test verification
- If the complaint is vague or ambiguous, still generate your best interpretation but set ambiguityFlag to explain what's unclear
- Include shop fees (shop supplies, hazmat if applicable, diagnostic fee if separate)
- Suggest 1-3 recommended additional services based on vehicle age/mileage and the repair being done

Respond ONLY with valid JSON matching this exact structure:
{
  "probableCauses": [
    { "cause": "string", "likelihood": "high|medium|low", "explanation": "string - why this is suspected" }
  ],
  "laborLines": [
    { "description": "string", "laborHours": number, "techNotes": "string" }
  ],
  "partLines": [
    { "description": "string", "partNumber": "string or null", "quantity": number, "unitCost": number, "unitPrice": number }
  ],
  "shopFees": [
    { "description": "string", "amount": number }
  ],
  "diagnosticChecklist": [
    {
      "item": "string - specific test or inspection step",
      "category": "visual|electrical|mechanical|scan_tool|measurement",
      "toolsRequired": ["string - specific tool or equipment needed"],
      "verificationCriteria": "string - what result confirms the issue"
    }
  ],
  "repairChecklist": [
    {
      "step": number,
      "title": "string - short action title",
      "details": "string - detailed instructions",
      "toolsRequired": ["string - specific tools for this step"],
      "torqueSpecs": "string or null - e.g. '25 ft-lbs'",
      "warning": "string or null - safety/critical note"
    }
  ],
  "recommendedServices": [
    { "service": "string", "reason": "string - why recommended", "estimatedCost": number }
  ],
  "cause": "string - the most probable root cause summary",
  "ambiguityFlag": "string or null - if complaint is vague, explain what clarification would help"
}`;

    // Retry logic: up to 2 attempts
    const MAX_RETRIES = 2;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await openai.chat.completions.create({
          model: "openai/gpt-5-mini",
          messages: [{ role: "user", content: prompt }],
        });

        const content = response.choices[0]?.message?.content ?? "{}";
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const result = JSON.parse(cleaned) as {
          probableCauses?: Array<{ cause: string; likelihood: string; explanation: string }>;
          laborLines: Array<{ description: string; laborHours: number; techNotes?: string }>;
          partLines: Array<{ description: string; partNumber?: string | null; quantity: number; unitCost: number; unitPrice: number }>;
          shopFees?: Array<{ description: string; amount: number }>;
          diagnosticChecklist: Array<{
            item: string;
            category?: string;
            toolsRequired?: string[];
            verificationCriteria?: string;
          }>;
          repairChecklist: Array<{
            step: number;
            title: string;
            details: string;
            toolsRequired?: string[];
            torqueSpecs?: string | null;
            warning?: string | null;
          }>;
          recommendedServices?: Array<{ service: string; reason: string; estimatedCost?: number }>;
          cause?: string;
          ambiguityFlag?: string | null;
        };

        // Calculate totals including shop fees
        const laborTotal = result.laborLines.reduce((sum, l) => sum + l.laborHours * laborRate, 0);
        const partsTotal = result.partLines.reduce((sum, p) => sum + p.unitPrice * p.quantity, 0);
        const feesTotal = (result.shopFees ?? []).reduce((sum, f) => sum + f.amount, 0);
        const subtotal = laborTotal + partsTotal + feesTotal;
        const taxAmount = subtotal * (taxRate / 100);
        const totalAmount = subtotal + taxAmount;

        // Build formatted data
        const formattedLaborLines = result.laborLines.map((l) => ({
          description: l.description,
          laborHours: l.laborHours,
          laborRate,
          techNotes: l.techNotes,
        }));

        const formattedPartLines = result.partLines.map((p) => ({
          description: p.description,
          partNumber: p.partNumber ?? undefined,
          quantity: p.quantity,
          unitCost: p.unitCost,
          unitPrice: p.unitPrice,
        }));

        const validCategories = ["visual", "electrical", "mechanical", "scan_tool", "measurement"] as const;
        type DiagCategory = typeof validCategories[number];

        const diagnosticChecklist = result.diagnosticChecklist.map((item) => ({
          item: item.item,
          category: (validCategories.includes(item.category as DiagCategory) ? item.category : undefined) as DiagCategory | undefined,
          toolsRequired: item.toolsRequired,
          verificationCriteria: item.verificationCriteria,
          completed: false,
        }));

        const repairChecklist = result.repairChecklist.map((step) => ({
          step: step.step,
          title: step.title,
          details: step.details,
          toolsRequired: step.toolsRequired,
          torqueSpecs: step.torqueSpecs ?? undefined,
          warning: step.warning ?? undefined,
          completed: false,
        }));

        const validLikelihoods = ["high", "medium", "low"] as const;
        type Likelihood = typeof validLikelihoods[number];

        const probableCauses = (result.probableCauses ?? []).map((pc) => ({
          cause: pc.cause,
          likelihood: (validLikelihoods.includes(pc.likelihood as Likelihood) ? pc.likelihood : "medium") as Likelihood,
          explanation: pc.explanation,
        }));

        const recommendedServices = (result.recommendedServices ?? []).map((rs) => ({
          service: rs.service,
          reason: rs.reason,
          estimatedCost: rs.estimatedCost,
        }));

        const shopFees = (result.shopFees ?? []).map((f) => ({
          description: f.description,
          amount: f.amount,
        }));

        // Save everything to the RO
        await ctx.runMutation(internal.repairOrders.applyAIWorkflow, {
          roId: args.roId,
          laborLines: formattedLaborLines,
          partLines: formattedPartLines,
          diagnosticChecklist,
          repairChecklist,
          probableCauses,
          recommendedServices,
          shopFees,
          cause: result.cause,
          ambiguityFlag: result.ambiguityFlag ?? undefined,
          subtotal,
          taxAmount,
          totalAmount,
        });

        // Success — exit retry loop
        return;
      } catch (error) {
        // Log safely — no customer PII, only error type and attempt count
        console.error(`AI Workflow attempt ${attempt}/${MAX_RETRIES} failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        if (attempt === MAX_RETRIES) {
          // All retries exhausted
          await ctx.runMutation(internal.repairOrders.patchROInternal, {
            roId: args.roId,
            fields: { aiWorkflowStatus: "failed" },
          });
        }
        // Otherwise loop retries
      }
    }
  },
});

// ─── Standalone AI Estimate Generator ────────────────────────────────────────
// Public action that takes vehicle + complaint info and returns a full estimate
// without creating an RO first. The UI can then "Save to Work Order" with the data.

export const generateStandaloneEstimate = action({
  args: {
    vehicle: v.string(), // "2018 Ford F-150 5.0L V8"
    complaint: v.string(),
    additionalNotes: v.optional(v.string()),
    laborRate: v.number(),
    taxRate: v.number(),
  },
  handler: async (ctx, args): Promise<{
    probableCauses: Array<{ cause: string; likelihood: "high" | "medium" | "low"; explanation: string }>;
    laborLines: Array<{ description: string; laborHours: number; laborRate: number; techNotes?: string }>;
    partLines: Array<{ description: string; partNumber?: string; quantity: number; unitCost: number; unitPrice: number }>;
    shopFees: Array<{ description: string; amount: number }>;
    diagnosticChecklist: Array<{
      item: string;
      category?: "visual" | "electrical" | "mechanical" | "scan_tool" | "measurement";
      toolsRequired?: string[];
      verificationCriteria?: string;
    }>;
    repairChecklist: Array<{
      step: number;
      title: string;
      details: string;
      toolsRequired?: string[];
      torqueSpecs?: string;
      warning?: string;
    }>;
    recommendedServices: Array<{ service: string; reason: string; estimatedCost?: number }>;
    cause: string;
    ambiguityFlag?: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
  }> => {
    // Auth check — only authenticated users may generate estimates
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "You must be signed in to generate estimates", code: "UNAUTHENTICATED" });
    }

    // Input validation
    if (!args.vehicle.trim()) {
      throw new ConvexError({ message: "Vehicle information is required", code: "BAD_REQUEST" });
    }
    if (!args.complaint.trim()) {
      throw new ConvexError({ message: "Complaint description is required", code: "BAD_REQUEST" });
    }
    if (args.laborRate <= 0) {
      throw new ConvexError({ message: "Labor rate must be greater than zero", code: "BAD_REQUEST" });
    }

    const { vehicle, complaint, additionalNotes, laborRate, taxRate } = args;
    const openai = getOpenAI();

    const prompt = `You are an expert ASE-certified master automotive technician and service writer with access to industry labor guides (Mitchell, AllData). Analyze the following and generate a complete workflow.

Vehicle: ${vehicle}
Customer Complaint: "${complaint}"${additionalNotes ? `\nAdditional Notes: "${additionalNotes}"` : ""}
Shop Labor Rate: $${laborRate}/hr

Generate a comprehensive response. Follow these rules strictly:
- Labor rates MUST use $${laborRate}/hr
- Parts unitPrice should include 40-60% markup over unitCost
- Include realistic part numbers where known (OEM or aftermarket)
- Diagnostic checklist: 4-8 items covering visual inspections, electrical tests, mechanical tests, scan tool procedures, and measurements (voltage, pressure, resistance)
- Each diagnostic item must include what tools/equipment are needed and what result confirms the failure
- Repair checklist: detailed steps with required tools, torque specs where applicable, safety warnings, and final road test verification
- If the complaint is vague or ambiguous, still generate your best interpretation but set ambiguityFlag to explain what's unclear
- Include shop fees (shop supplies, hazmat if applicable, diagnostic fee if separate)
- Suggest 1-3 recommended additional services based on vehicle age/mileage and the repair being done

Respond ONLY with valid JSON matching this exact structure:
{
  "probableCauses": [
    { "cause": "string", "likelihood": "high|medium|low", "explanation": "string - why this is suspected" }
  ],
  "laborLines": [
    { "description": "string", "laborHours": number, "techNotes": "string" }
  ],
  "partLines": [
    { "description": "string", "partNumber": "string or null", "quantity": number, "unitCost": number, "unitPrice": number }
  ],
  "shopFees": [
    { "description": "string", "amount": number }
  ],
  "diagnosticChecklist": [
    {
      "item": "string - specific test or inspection step",
      "category": "visual|electrical|mechanical|scan_tool|measurement",
      "toolsRequired": ["string - specific tool or equipment needed"],
      "verificationCriteria": "string - what result confirms the issue"
    }
  ],
  "repairChecklist": [
    {
      "step": number,
      "title": "string - short action title",
      "details": "string - detailed instructions",
      "toolsRequired": ["string - specific tools for this step"],
      "torqueSpecs": "string or null - e.g. '25 ft-lbs'",
      "warning": "string or null - safety/critical note"
    }
  ],
  "recommendedServices": [
    { "service": "string", "reason": "string - why recommended", "estimatedCost": number }
  ],
  "cause": "string - the most probable root cause summary",
  "ambiguityFlag": "string or null - if complaint is vague, explain what clarification would help"
}`;

    // Retry logic: 2 attempts with timeout handling
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await openai.chat.completions.create({
          model: "openai/gpt-5-mini",
          messages: [{ role: "user", content: prompt }],
        });

        const content = response.choices[0]?.message?.content ?? "{}";
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

        let result: {
          probableCauses?: Array<{ cause: string; likelihood: string; explanation: string }>;
          laborLines: Array<{ description: string; laborHours: number; techNotes?: string }>;
          partLines: Array<{ description: string; partNumber?: string | null; quantity: number; unitCost: number; unitPrice: number }>;
          shopFees?: Array<{ description: string; amount: number }>;
          diagnosticChecklist: Array<{
            item: string;
            category?: string;
            toolsRequired?: string[];
            verificationCriteria?: string;
          }>;
          repairChecklist: Array<{
            step: number;
            title: string;
            details: string;
            toolsRequired?: string[];
            torqueSpecs?: string | null;
            warning?: string | null;
          }>;
          recommendedServices?: Array<{ service: string; reason: string; estimatedCost?: number }>;
          cause?: string;
          ambiguityFlag?: string | null;
        };

        try {
          result = JSON.parse(cleaned);
        } catch {
          // AI returned invalid JSON — log safely (no PII) and retry
          console.error(`AI estimate JSON parse error on attempt ${attempt}/${MAX_ATTEMPTS}. Response length: ${cleaned.length}`);
          if (attempt === MAX_ATTEMPTS) {
            throw new ConvexError({ message: "AI returned an invalid response. Please try again.", code: "EXTERNAL_SERVICE_ERROR" });
          }
          continue;
        }

        // Validate required arrays exist
        if (!result.laborLines || !result.partLines || !result.diagnosticChecklist || !result.repairChecklist) {
          console.error(`AI estimate missing required fields on attempt ${attempt}/${MAX_ATTEMPTS}`);
          if (attempt === MAX_ATTEMPTS) {
            throw new ConvexError({ message: "AI response was incomplete. Please try again.", code: "EXTERNAL_SERVICE_ERROR" });
          }
          continue;
        }

        // Calculate totals
        const laborTotal = result.laborLines.reduce((sum, l) => sum + l.laborHours * laborRate, 0);
        const partsTotal = result.partLines.reduce((sum, p) => sum + p.unitPrice * p.quantity, 0);
        const feesTotal = (result.shopFees ?? []).reduce((sum, f) => sum + f.amount, 0);
        const subtotal = laborTotal + partsTotal + feesTotal;
        const taxAmount = subtotal * (taxRate / 100);
        const totalAmount = subtotal + taxAmount;

        const validCategories = ["visual", "electrical", "mechanical", "scan_tool", "measurement"] as const;
        type DiagCategory = typeof validCategories[number];
        const validLikelihoods = ["high", "medium", "low"] as const;
        type Likelihood = typeof validLikelihoods[number];

        return {
          probableCauses: (result.probableCauses ?? []).map((pc) => ({
            cause: pc.cause,
            likelihood: (validLikelihoods.includes(pc.likelihood as Likelihood) ? pc.likelihood : "medium") as Likelihood,
            explanation: pc.explanation,
          })),
          laborLines: result.laborLines.map((l) => ({
            description: l.description,
            laborHours: l.laborHours,
            laborRate,
            techNotes: l.techNotes,
          })),
          partLines: result.partLines.map((p) => ({
            description: p.description,
            partNumber: p.partNumber ?? undefined,
            quantity: p.quantity,
            unitCost: p.unitCost,
            unitPrice: p.unitPrice,
          })),
          shopFees: (result.shopFees ?? []).map((f) => ({
            description: f.description,
            amount: f.amount,
          })),
          diagnosticChecklist: result.diagnosticChecklist.map((item) => ({
            item: item.item,
            category: (validCategories.includes(item.category as DiagCategory) ? item.category : undefined) as DiagCategory | undefined,
            toolsRequired: item.toolsRequired,
            verificationCriteria: item.verificationCriteria,
          })),
          repairChecklist: result.repairChecklist.map((step) => ({
            step: step.step,
            title: step.title,
            details: step.details,
            toolsRequired: step.toolsRequired,
            torqueSpecs: step.torqueSpecs ?? undefined,
            warning: step.warning ?? undefined,
          })),
          recommendedServices: (result.recommendedServices ?? []).map((rs) => ({
            service: rs.service,
            reason: rs.reason,
            estimatedCost: rs.estimatedCost,
          })),
          cause: result.cause ?? "Unable to determine",
          ambiguityFlag: result.ambiguityFlag ?? undefined,
          subtotal,
          taxAmount,
          totalAmount,
        };
      } catch (error) {
        // If it's already a ConvexError, re-throw it
        if (error instanceof ConvexError) throw error;

        // Log safely without PII — only include error type and attempt info
        console.error(`AI estimate generation failed on attempt ${attempt}/${MAX_ATTEMPTS}: ${error instanceof Error ? error.message : "Unknown error"}`);
        if (attempt === MAX_ATTEMPTS) {
          throw new ConvexError({
            message: "Unable to generate estimate at this time. The AI service may be temporarily unavailable. Please try again in a moment.",
            code: "EXTERNAL_SERVICE_ERROR",
          });
        }
      }
    }

    // TypeScript safety — this should never be reached due to throw above
    throw new ConvexError({ message: "Unexpected error generating estimate", code: "EXTERNAL_SERVICE_ERROR" });
  },
});