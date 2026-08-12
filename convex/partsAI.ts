"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

export const suggestOrders = action({
  args: {},
  handler: async (ctx): Promise<{
    suggestions: Array<{
      supplierId: string;
      supplierName: string;
      lines: Array<{
        partId: string;
        partNumber: string;
        description: string;
        currentStock: number;
        suggestedQty: number;
        unitCost: number;
        reason: string;
      }>;
      totalCost: number;
      summary: string;
    }>;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { suggestions: [] };

    // Fetch low stock parts and supplier list
    const [lowStockParts, suppliers] = await Promise.all([
      ctx.runQuery(api.parts.getLowStockParts, {}),
      ctx.runQuery(api.parts.listSuppliers, {}),
    ]);

    if (lowStockParts.length === 0) {
      return { suggestions: [] };
    }

    const { getOpenAI } = await import("./openaiClient");
    const openai = getOpenAI();

    const partsContext = lowStockParts.map((p) => ({
      id: p._id,
      name: p.name,
      partNumber: p.partNumber ?? "",
      currentStock: p.stockQty,
      threshold: p.lowStockThreshold,
      unitCost: p.unitCost,
      supplier: p.supplier ?? "Unknown",
    }));

    const suppliersContext = suppliers.map((s) => ({
      id: s._id,
      name: s.name,
    }));

    const prompt = `You are an AI assistant for an auto repair shop inventory system. 
Analyze these low-stock parts and suggest purchase orders grouped by supplier.

Low Stock Parts:
${JSON.stringify(partsContext, null, 2)}

Available Suppliers:
${JSON.stringify(suppliersContext, null, 2)}

For each part, suggest how much to reorder (at least 2x the threshold to avoid frequent reorders).
Group suggestions by supplier. If a part's supplier field matches a known supplier, use that supplier ID.
If no match, use the first available supplier or leave supplierId as "unknown".

Return JSON in this exact structure:
{
  "suggestions": [
    {
      "supplierId": "<supplier _id or 'unknown'>",
      "supplierName": "<name>",
      "summary": "<one sentence why this order is needed>",
      "lines": [
        {
          "partId": "<part _id>",
          "partNumber": "<part number>",
          "description": "<part name>",
          "currentStock": <number>,
          "suggestedQty": <number>,
          "unitCost": <number>,
          "reason": "<brief reason>"
        }
      ],
      "totalCost": <number>
    }
  ]
}

Return only valid JSON, no markdown.`;

    const response = await openai.chat.completions.create({
      model: "openai/gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(content) as {
        suggestions: Array<{
          supplierId: string;
          supplierName: string;
          lines: Array<{
            partId: string;
            partNumber: string;
            description: string;
            currentStock: number;
            suggestedQty: number;
            unitCost: number;
            reason: string;
          }>;
          totalCost: number;
          summary: string;
        }>;
      };
      return parsed;
    } catch {
      return { suggestions: [] };
    }
  },
});

// ─── Bulk create POs from AI suggestions ──────────────────────────────────────

export const bulkCreateFromSuggestions = action({
  args: {
    suggestions: v.array(
      v.object({
        supplierId: v.string(),
        supplierName: v.string(),
        summary: v.string(),
        totalCost: v.number(),
        lines: v.array(
          v.object({
            partId: v.string(),
            partNumber: v.string(),
            description: v.string(),
            currentStock: v.number(),
            suggestedQty: v.number(),
            unitCost: v.number(),
            reason: v.string(),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args): Promise<{ created: number; skipped: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { created: 0, skipped: 0 };

    const suppliers = await ctx.runQuery(api.parts.listSuppliers, {});
    const supplierIds = new Set(suppliers.map((s) => s._id as string));

    let created = 0;
    let skipped = 0;

    for (const suggestion of args.suggestions) {
      if (!supplierIds.has(suggestion.supplierId)) {
        skipped++;
        continue;
      }
      try {
        await ctx.runMutation(api.parts.createPurchaseOrder, {
          supplierId: suggestion.supplierId as import("./_generated/dataModel.d.ts").Id<"suppliers">,
          lines: suggestion.lines.map((l) => ({
            partId: l.partId || undefined,
            partNumber: l.partNumber || undefined,
            description: l.description,
            qtyOrdered: l.suggestedQty,
            qtyReceived: 0,
            unitCost: l.unitCost,
          })),
          notes: suggestion.summary,
          aiGenerated: true,
          aiReason: suggestion.summary,
        });
        created++;
      } catch {
        skipped++;
      }
    }

    return { created, skipped };
  },
});
