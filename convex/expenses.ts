import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server.d.ts";
import type { Id } from "./_generated/dataModel.d.ts";

async function requireMember(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user?.currentOrgId) throw new ConvexError({ message: "No organization", code: "FORBIDDEN" });
  const member = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
    .first();
  if (!member || !member.isActive) throw new ConvexError({ message: "Not a member", code: "FORBIDDEN" });
  return { user, member, orgId: user.currentOrgId as Id<"organizations"> };
}

export const EXPENSE_CATEGORIES = [
  "parts",
  "sublet",
  "rent",
  "utilities",
  "insurance",
  "tools",
  "fuel",
  "marketing",
  "payroll_tax",
  "other",
] as const;

export const listExpenses = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireMember(ctx);
    let rows = await ctx.db
      .query("shopExpenses")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(300);
    if (args.startDate) rows = rows.filter((r) => r.date >= args.startDate!);
    if (args.endDate) rows = rows.filter((r) => r.date <= args.endDate!);
    return rows;
  },
});

export const createExpense = mutation({
  args: {
    date: v.string(),
    category: v.string(),
    vendorName: v.string(),
    supplierId: v.optional(v.id("suppliers")),
    amount: v.number(),
    notes: v.optional(v.string()),
    poId: v.optional(v.id("purchaseOrders")),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireMember(ctx);
    if (args.amount < 0) {
      throw new ConvexError({ message: "Amount cannot be negative", code: "BAD_REQUEST" });
    }
    return await ctx.db.insert("shopExpenses", {
      orgId,
      date: args.date,
      category: args.category,
      vendorName: args.vendorName.trim(),
      supplierId: args.supplierId,
      amount: args.amount,
      notes: args.notes,
      poId: args.poId,
      createdBy: user._id,
    });
  },
});

export const deleteExpense = mutation({
  args: { expenseId: v.id("shopExpenses") },
  handler: async (ctx, args) => {
    const { orgId, member } = await requireMember(ctx);
    if (!["owner", "admin"].includes(member.role) && !member.hasAdminAccess) {
      throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });
    }
    const row = await ctx.db.get(args.expenseId);
    if (!row || row.orgId !== orgId) {
      throw new ConvexError({ message: "Expense not found", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.expenseId);
  },
});
